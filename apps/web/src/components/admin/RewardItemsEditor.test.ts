import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { resetTitleList } from './titleList';
import { useCatalogStore } from '../../stores/catalog';
import { ACTIVITY_REWARD_PRESETS } from '@dt/shared';
import RewardItemsEditor from './RewardItemsEditor.vue';

vi.mock('../../api/admin', () => ({ adminApi: { titles: vi.fn(), createTitle: vi.fn() } }));

describe('RewardItemsEditor', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('填银币和一顶命名帽子，输出的附件只含填了的项', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: true } });
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="ri-add-hat"]').trigger('click');
    await w.find('[data-testid="ri-hat-name-0"]').setValue('大橘');
    const last = w.emitted('update:modelValue')!.at(-1)![0];
    expect(last).toEqual({ coin: 100, hats: [{ tier: 'jade', name: '大橘' }] });
  });

  it('超过上限时报出来；不开帽子时没有帽子那一组', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: false } });
    expect(w.find('[data-testid="ri-add-hat"]').exists()).toBe(false);
    await w.find('[data-testid="ri-diamond"]').setValue('100001');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['钻石最多 100,000']);
  });

  it('帽子行没填名字时报出来，父组件据此禁止提交', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: true } });
    await w.find('[data-testid="ri-add-hat"]').trigger('click');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['第 1 顶帽子没填名字']);
    await w.find('[data-testid="ri-hat-name-0"]').setValue('大橘');
    expect(w.emitted('over')!.at(-1)![0]).toEqual([]);
  });

  it('道具、食材用搜索下拉选，不用手填 id（问题记录 270）', async () => {
    useCatalogStore().goodsMap = new Map([
      [
        315,
        {
          id: 315,
          name: '喇叭',
          type: 1,
          deviceType: null,
          level: 1,
          desc: '',
          coin: 0,
          diamond: 0,
        } as never,
      ],
    ]);
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: false } });
    await w.find('[data-testid="ri-add-goods"]').trigger('click');
    await w.find('[data-testid="ri-goods-id-0"]').setValue('喇');
    await w.find('[data-testid="ri-goods-id-0-opt-315"]').trigger('mousedown');
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ goods: [{ id: 315, num: 1 }] });
  });

  it('只选道具模式（战令解锁价格，backlog 148-1）：没有银币、钻石、经验、食材、帽子', () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: true, goodsOnly: true } });
    for (const k of ['coin', 'diamond', 'exp', 'add-foods', 'add-hat'])
      expect(w.find(`[data-testid="ri-${k}"]`).exists()).toBe(false);
    expect(w.find('[data-testid="ri-add-goods"]').exists()).toBe(true);
  });

  it('写明食材有单种上限：超出橱柜和冰箱的部分会丢弃（问题记录 204）', () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: false } });
    expect(w.find('[data-testid="ri-limits"]').text()).toContain('多出的会丢弃');
  });

  it('推荐奖励（问题记录 505）：开了 presets 才显示；点一下加一行，再点同一样加数量', async () => {
    expect(
      mount(RewardItemsEditor, { props: { modelValue: {} } })
        .find('[data-testid="ri-presets"]')
        .exists(),
    ).toBe(false);
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, presets: true } });
    const food = ACTIVITY_REWARD_PRESETS.find((p) => p.kind === 'foods')!;
    const goods = ACTIVITY_REWARD_PRESETS.find((p) => p.kind === 'goods')!;
    const btn = (kind: string, id: number) => w.find(`[data-testid="ri-preset-${kind}-${id}"]`);
    await btn('foods', food.id).trigger('click');
    await btn('goods', goods.id).trigger('click');
    await btn('foods', food.id).trigger('click');
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({
      goods: [{ id: goods.id, num: goods.num }],
      foods: [{ id: food.id, num: food.num * 2 }],
    });
    // 按钮上写名字，不靠目录（目录没加载时也能看懂）
    expect(btn('foods', food.id).text()).toContain(food.name);
  });

  it('推荐奖励：已有这一行但数量是空的，点推荐填上推荐的数量（505 遗留：缺的测试）', async () => {
    const food = ACTIVITY_REWARD_PRESETS.find((p) => p.kind === 'foods')!;
    const w = mount(RewardItemsEditor, {
      props: { modelValue: { foods: [{ id: food.id, num: '' as never }] }, presets: true },
    });
    const rows = () => w.findAll('[data-testid^="ri-foods-num-"]').length;
    const before = rows();
    expect(before).toBe(1);
    await w.find(`[data-testid="ri-preset-foods-${food.id}"]`).trigger('click');
    // 合并进已有的那一行，不另加一行
    expect(rows()).toBe(before);
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ foods: [{ id: food.id, num: food.num }] });
  });

  it('推荐奖励：点到超过 9999 时出红字，报给父组件（505 遗留：缺的测试）', async () => {
    const goods = ACTIVITY_REWARD_PRESETS.find((p) => p.kind === 'goods')!;
    const w = mount(RewardItemsEditor, {
      props: { modelValue: { goods: [{ id: goods.id, num: 9999 }] }, presets: true },
    });
    expect(w.find('[data-testid="ri-over"]').exists()).toBe(false);
    await w.find(`[data-testid="ri-preset-goods-${goods.id}"]`).trigger('click');
    expect(w.find('[data-testid="ri-over"]').exists()).toBe(true);
    expect(((w.emitted('over') ?? []).at(-1)![0] as string[]).length).toBeGreaterThan(0);
  });

  it('称号（定制称号设计 三）：不开时没有这一栏；开了要选称号、限时要填完', async () => {
    resetTitleList();
    vi.mocked(adminApi.titles).mockResolvedValue([
      {
        key: 'c2',
        id: 2,
        title: '面霸',
        desc: null,
        note: null,
        source: 'custom',
        retired: false,
        owners: 0,
        createdBy: null,
        createdAt: null,
      },
    ]);
    const off = mount(RewardItemsEditor, { props: { modelValue: {} } });
    expect(off.find('[data-testid="ri-add-icon"]').exists()).toBe(false);
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, icons: true } });
    await w.find('[data-testid="ri-add-icon"]').trigger('click');
    await flushPromises();
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['第 1 个称号没选']);
    await w.find('[data-testid="ri-icon-0-select"]').setValue('c2');
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ icons: [{ key: 'c2', title: '面霸' }] });
    expect(w.emitted('over')!.at(-1)![0]).toEqual([]);
    await w.find('[data-testid="ri-icon-0-mode"]').setValue('days');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['第 1 个称号的有效天数要在 1~3650']);
    await w.find('[data-testid="ri-icon-0-days"]').setValue(30);
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({
      icons: [{ key: 'c2', title: '面霸', days: 30 }],
    });
    await w.find('[data-testid="ri-icon-0-mode"]').setValue('until');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['第 1 个称号没填到期时间']);
    await w.find('[data-testid="ri-icon-0-remove"]').trigger('click');
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({});
  });

  it('删掉前面的称号行，后面一行选好的不丢', async () => {
    resetTitleList();
    const t = (key: string, title: string) => ({
      key,
      id: Number(key.slice(1)),
      title,
      desc: null,
      note: null,
      source: 'custom' as const,
      retired: false,
      owners: 0,
      createdBy: null,
      createdAt: null,
    });
    vi.mocked(adminApi.titles).mockResolvedValue([t('c2', '面霸'), t('c3', '饭王')]);
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, icons: true } });
    await w.find('[data-testid="ri-add-icon"]').trigger('click');
    await w.find('[data-testid="ri-add-icon"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ri-icon-0-select"]').setValue('c2');
    await w.find('[data-testid="ri-icon-1-select"]').setValue('c3');
    await w.find('[data-testid="ri-icon-0-remove"]').trigger('click');
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ icons: [{ key: 'c3', title: '饭王' }] });
    expect((w.find('[data-testid="ri-icon-0-select"]').element as HTMLSelectElement).value).toBe('c3');
  });
});

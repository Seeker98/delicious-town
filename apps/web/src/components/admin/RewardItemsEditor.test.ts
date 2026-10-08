import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../../stores/catalog';
import { ACTIVITY_REWARD_PRESETS } from '@dt/shared';
import RewardItemsEditor from './RewardItemsEditor.vue';

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
});

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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
});

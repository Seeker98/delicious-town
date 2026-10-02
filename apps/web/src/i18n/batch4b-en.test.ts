import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlantDto } from '@dt/shared';
import PlantCard from '../components/yard/PlantCard.vue';
import { stageName, statusText, waterBlock } from '../components/yard/plant';
import { useLocaleStore } from '../stores/locale';

const plant = (patch: Partial<PlantDto> = {}): PlantDto =>
  ({
    id: 1,
    foodsId: 2,
    stage: 2,
    minutes: 12,
    canWater: false,
    worm: 0,
    grass: 0,
    dry: 0,
    harvestNum: 10,
    harvestMax: 20,
    stageMinutes: 60,
    feedMin: 0,
    ...patch,
  }) as PlantDto;

describe('第 4b 批菜园按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：作物阶段、状态、按钮', async () => {
    await useLocaleStore().set('en');
    expect(stageName(2)).toBe('Seedling');
    expect(statusText(plant())).toBe('12 min until you can water');
    expect(waterBlock(plant({ worm: 1 }), 5)).toBe('Remove the bugs first');
    const w = mount(PlantCard, { props: { plant: plant({ worm: 2 }), strength: 5, busy: false } });
    expect(w.find('[data-testid="plant-water"]').text()).toBe('Water');
    expect(w.find('[data-testid="plant-deworm"]').text()).toBe('Remove bugs');
    expect(w.text()).toContain('Yield 10/20');
    expect(w.text()).not.toMatch(/[一-鿿]/);
  });
});

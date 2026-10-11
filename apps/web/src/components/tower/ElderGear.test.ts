import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ElderGear from './ElderGear.vue';
import { towerFloor } from './testData';

describe('ElderGear（问题记录 408）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('长老装备：等级、强化、掉落概率；加点、每件厨具、被挑战时的属性、可能掉落', () => {
    const w = mount(ElderGear, { props: { elder: towerFloor(1).elder } });
    const box = w.get('[data-testid="elder-gear"]');
    expect(box.find('b').text()).toBe('长老装备 · 8 级 · 全套强化 +3');
    expect(box.text()).toContain('正式挑战打赢有 20% 掉一件');
    expect(w.find('[data-testid="elder-points"]').text()).toBe('加点: 厨艺 0、刀工 21、火候 0');
    const pieces = w.findAll('[data-testid="elder-piece"]');
    expect(pieces).toHaveLength(2);
    // 名字后面带强化等级（加粗），再写属性；只列不为 0 的属性
    expect(pieces[0]!.find('b').text()).toMatch(/ \+3$/);
    expect(pieces[0]!.text()).toMatch(/\+3 厨艺 2、刀工 5$/);
    expect(pieces[1]!.text()).toMatch(/\+3 刀工 2、火候 3$/);
    expect(w.find('[data-testid="elder-attrs"]').text()).toBe(
      '被挑战时: 厨艺 2、刀工 29、火候 5、调味 0、创意 0、幸运 7',
    );
    expect(w.find('[data-testid="elder-drops"]').text()).toContain('可能掉落: ');
  });

  it('这一层不掉落（区服把概率设成 0）时不提掉落', () => {
    const w = mount(ElderGear, { props: { elder: { ...towerFloor(1).elder, dropRate: 0 } } });
    expect(w.get('[data-testid="elder-gear"]').find('b').text()).toBe('长老装备 · 8 级 · 全套强化 +3');
    expect(w.text()).not.toContain('掉一件');
  });
});

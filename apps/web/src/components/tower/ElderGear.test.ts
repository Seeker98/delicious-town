import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ElderGear from './ElderGear.vue';
import { towerFloor } from './testData';

describe('ElderGear（问题记录 408）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('收起的长老装备：等级、强化、掉落概率；展开后是加点、每件厨具、被挑战时的属性、可能掉落', () => {
    const w = mount(ElderGear, { props: { elder: towerFloor(1).elder } });
    expect(w.find('details').attributes('open')).toBeUndefined();
    expect(w.find('summary').text()).toBe('长老装备: 8 级，全套强化 +3；正式挑战打赢有 20% 掉一件');
    expect(w.find('[data-testid="elder-points"]').text()).toBe('加点: 厨艺 0、刀工 21、火候 0');
    const pieces = w.findAll('[data-testid="elder-piece"]');
    expect(pieces).toHaveLength(2);
    // 只列不为 0 的属性
    expect(pieces[0]!.text()).toContain('+3: 厨艺 2、刀工 5');
    expect(w.find('[data-testid="elder-attrs"]').text()).toBe(
      '被挑战时: 厨艺 2、刀工 29、火候 5、调味 0、创意 0、幸运 7',
    );
    expect(w.find('[data-testid="elder-drops"]').text()).toContain('可能掉落: ');
  });

  it('这一层不掉落（区服把概率设成 0）时不提掉落', () => {
    const w = mount(ElderGear, { props: { elder: { ...towerFloor(1).elder, dropRate: 0 } } });
    expect(w.find('summary').text()).toBe('长老装备: 8 级，全套强化 +3');
  });
});

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DuelRules from './DuelRules.vue';

describe('DuelRules（问题记录 396）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('收起的规则说明：五项怎么算、评委怎么投票，10 位评委各看哪几项', () => {
    const w = mount(DuelRules);
    expect(w.find('details').attributes('open')).toBeUndefined();
    expect(w.find('summary').text()).toBe('赛厨规则');
    expect(w.text()).toContain('先拿到 3 票的赢');
    const judges = w.findAll('[data-testid="duel-rules-judge"]');
    expect(judges).toHaveLength(10);
    expect(judges[0]!.text()).toBe('菜园姐（色、形、养）');
    expect(judges[9]!.text()).toBe('小凯（味、养）');
  });
});

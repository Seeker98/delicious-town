import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DuelResult from './DuelResult.vue';
import { duelResult } from './testData';

describe('DuelResult', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('胜负和声望；五项并排，赢的一项加粗；奖励', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了，声望 +7');
    const first = w.findAll('tbody tr')[0]!.findAll('td');
    expect(first[0]!.text()).toBe('20.4');
    expect(first[0]!.classes()).toContain('fw-bold');
    expect(first[1]!.classes()).not.toContain('fw-bold');
    expect(w.text()).toContain('我的店（厨力 70）');
    expect(w.find('[data-testid="duel-awards"]').text()).toBe('得到 银币 600');
  });

  it('试打没有声望；赛厨榜写新名次；输了', () => {
    const test = mount(DuelResult, { props: { result: duelResult({ test: true, renown: 0, awards: [] }) } });
    expect(test.find('[data-testid="duel-headline"]').text()).toBe('试打：赢了');
    expect(test.find('[data-testid="duel-awards"]').exists()).toBe(false);
    const rank = mount(DuelResult, { props: { result: duelResult({ renown: 2, rank: 1 }) } });
    expect(rank.find('[data-testid="duel-headline"]').text()).toBe('你赢了，声望 +2，你现在是第 1 名');
    const lose = mount(DuelResult, { props: { result: duelResult({ win: false, renown: -2, awards: [] }) } });
    expect(lose.find('[data-testid="duel-headline"]').text()).toBe('你输了，声望 -2');
  });
});

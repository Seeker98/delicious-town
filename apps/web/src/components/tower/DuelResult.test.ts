import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DuelResult from './DuelResult.vue';
import { duelResult } from './testData';

describe('DuelResult', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('胜负和声望；五项并排，赢的一项加粗；奖励', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了 3:1，声望 +7');
    const first = w.findAll('tbody tr')[0]!.findAll('td');
    expect(first[0]!.text()).toBe('20.4');
    expect(first[0]!.classes()).toContain('fw-bold');
    expect(first[1]!.classes()).not.toContain('fw-bold');
    expect(w.text()).toContain('我的店（厨力 70）');
    expect(w.find('[data-testid="duel-awards"]').text()).toBe('得到 银币 600');
  });

  it('试打没有声望；赛厨榜写新名次；输了', () => {
    const test = mount(DuelResult, { props: { result: duelResult({ test: true, renown: 0, awards: [] }) } });
    expect(test.find('[data-testid="duel-headline"]').text()).toBe('试打：赢了 3:1');
    expect(test.find('[data-testid="duel-awards"]').exists()).toBe(false);
    const rank = mount(DuelResult, { props: { result: duelResult({ renown: 2, rank: 1 }) } });
    expect(rank.find('[data-testid="duel-headline"]').text()).toBe('你赢了 3:1，声望 +2，你现在是第 1 名');
    const lose = mount(DuelResult, {
      props: { result: duelResult({ win: false, renown: -2, awards: [], votes: [1, 3] }) },
    });
    expect(lose.find('[data-testid="duel-headline"]').text()).toBe('你输了 1:3，声望 -2');
  });

  it('评委按上场顺序列出：名字、关注的项目、双方的分，这一票给谁（问题记录 396）', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    const rows = w.findAll('[data-testid="duel-judge"]');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.text()).toContain('卡门');
    expect(rows[0]!.text()).toContain('色、香');
    expect(rows[0]!.text()).toContain('39.8 : 16.1');
    expect(rows[0]!.text()).toContain('投给你');
    expect(rows[1]!.text()).toContain('老穷头');
    expect(rows[1]!.text()).toContain('投给对方');
    expect(w.text()).not.toContain('总和');
  });

  it('评委给的分相同：写“平”', () => {
    const w = mount(DuelResult, {
      props: { result: duelResult({ judges: [{ id: 'gary', me: 10, them: 10 }], votes: [0, 0] }) },
    });
    expect(w.find('[data-testid="duel-judge"]').text()).toContain('平');
  });

  it('票数持平时标题写明按总分定胜负', () => {
    const w = mount(DuelResult, { props: { result: duelResult({ votes: [2, 2] }) } });
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了 2:2（票数相同，比总分），声望 +7');
  });

  it('换了一局结果时评委列表整个重画，动画从头播（同一位评委也重新淡入）', async () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    const before = w.find('ol').element;
    await w.setProps({ result: duelResult({ win: false, votes: [1, 3] }) });
    expect(w.find('ol').element).not.toBe(before);
  });
});

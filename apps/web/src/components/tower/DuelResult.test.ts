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

  it('评委按上场顺序点评：逐项写胜负、比分，这一票给谁（问题记录 396、431）', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    expect(w.text()).toContain('评委点评');
    const rows = w.findAll('[data-testid="duel-judge"]');
    expect(rows).toHaveLength(4);
    // 老乔（原来的卡门）看色、香；戈登（原来的老穷头）看形、养
    expect(rows[0]!.text()).toContain('【老乔 点评 我】：以[色]大获全胜，以[香]大获全胜，比分 39.8:16.1');
    expect(rows[0]!.text()).toContain('投给你');
    expect(rows[1]!.text()).toContain('【戈登 点评 我】');
    expect(rows[1]!.text()).toContain('投给对方');
    expect(w.text()).not.toMatch(/卡门|老穷头|总和/);
  });

  it('每项的点评：差 10% 以内不分伯仲，高出大获全胜，低了全军覆没（问题记录 431）', () => {
    const base = duelResult();
    const w = mount(DuelResult, {
      props: {
        result: duelResult({
          me: { ...base.me, scores: [10, 10, 10, 10, 10] },
          them: { ...base.them, scores: [20, 10.5, 5, 10, 0] },
          judges: [
            { id: 'joe', me: 20, them: 30.5 },
            { id: 'xiaoKai', me: 20, them: 10 },
          ],
          votes: [1, 1],
        }),
      },
    });
    const rows = w.findAll('[data-testid="duel-judge"]');
    expect(rows[0]!.text()).toContain('以[色]全军覆没，以[香]不分伯仲，比分 20:30.5');
    // 小凯看味、养：10 比 5、10 比 0
    expect(rows[1]!.text()).toContain('以[味]大获全胜，以[养]大获全胜');
  });

  it('双方的特色菜：“【菜（几级）】 VS 【菜】”，没有写“无米之炊”（问题记录 431）', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    expect(w.get('[data-testid="duel-dishes"]').text()).toMatch(/^【.+（5 级）】 VS 【无米之炊】$/);
  });

  it('评委给的分相同：写“平”', () => {
    const w = mount(DuelResult, {
      props: { result: duelResult({ judges: [{ id: 'gary', me: 10, them: 10 }], votes: [0, 0] }) },
    });
    expect(w.find('[data-testid="duel-judge"]').text()).toContain('平');
  });

  it('不认识的评委（服务器加了新评委、网页还是旧的）写编号，不写 undefined（backlog 396）', () => {
    const w = mount(DuelResult, {
      props: { result: duelResult({ judges: [{ id: 'newbie' as never, me: 12, them: 10 }], votes: [1, 0] }) },
    });
    expect(w.find('[data-testid="duel-judge"]').text()).toContain('newbie');
    expect(w.find('[data-testid="duel-judge"]').text()).not.toContain('undefined');
  });

  it('长老掉的厨具单独一行写出来；没掉不写（backlog 408）', () => {
    const w = mount(DuelResult, { props: { result: duelResult({ elderDrop: 40002 }) } });
    expect(w.get('[data-testid="duel-elder-drop"]').text()).toContain('长老掉落');
    expect(
      mount(DuelResult, { props: { result: duelResult() } })
        .find('[data-testid="duel-elder-drop"]')
        .exists(),
    ).toBe(false);
  });

  it('传了对手的显示名（厨塔楼层的译名）就用它，不用服务器给的中文名（视觉第三轮）', () => {
    const w = mount(DuelResult, { props: { result: duelResult(), themName: 'Restaurant modèle' } });
    expect(w.find('thead').text()).toContain('Restaurant modèle');
    expect(w.find('thead').text()).not.toContain('见习模范餐厅');
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

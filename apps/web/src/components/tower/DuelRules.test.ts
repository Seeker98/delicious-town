import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DuelRules from './DuelRules.vue';

/** 规则说明放在底部面板里（Teleport 到 body）：测试里把 teleport 桩掉，点开后内容留在 wrapper 里（界面改版 P9） */
type Props = InstanceType<typeof DuelRules>['$props'];
const openRules = async (props: Props = {}) => {
  const w = mount(DuelRules, { props, global: { stubs: { teleport: true } } });
  await w.get('[data-testid="duel-rules"]').trigger('click');
  return w;
};

describe('DuelRules（问题记录 396）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('收起的规则说明：五项怎么算、评委怎么投票，10 位评委各看哪几项', async () => {
    const w = mount(DuelRules, { global: { stubs: { teleport: true } } });
    // 默认收着：只有一行“赛厨规则 ›”，点开才有说明
    expect(w.get('[data-testid="duel-rules"]').text()).toContain('赛厨规则');
    expect(w.find('[data-testid="duel-rules-body"]').exists()).toBe(false);
    await w.get('[data-testid="duel-rules"]').trigger('click');
    const body = w.get('[data-testid="duel-rules-body"]');
    expect(body.text()).toContain('先拿到 3 票的赢');
    const judges = w.findAll('[data-testid="duel-rules-judge"]');
    expect(judges).toHaveLength(10);
    expect(judges[0]!.text()).toBe('菜园姐 (色、形、养)');
    expect(judges[9]!.text()).toBe('小凯 (味、养)');
  });

  it('每局请几位评委按区服设置写，过半票数跟着变（backlog 396）', async () => {
    const w = await openRules({ judgeCount: 3 });
    expect(w.get('[data-testid="duel-rules"]').text()).toContain('3 位评委投票');
    expect(w.get('[data-testid="duel-rules-body"]').text()).toContain('每局从 10 位评委里随机请 3 位');
    expect(w.get('[data-testid="duel-rules-body"]').text()).toContain('先拿到 2 票的赢');
    expect((await openRules()).get('[data-testid="duel-rules-body"]').text()).toContain('随机请 5 位');
  });

  it('五项各看哪些属性按区服的评分权重写：权重大的在前，0 的不写，特色菜放最后（backlog 396）', async () => {
    const z = { cook: 0, cutting: 0, fire: 0, season: 0, mc: 0 };
    const weights = [
      { ...z, fire: 1 },
      { ...z, cook: 0.2, season: 0.8 },
      { ...z, fire: 0.5, season: 0.5 },
      { ...z, cutting: 0.7, fire: 0.4 },
      { ...z, cutting: 0.2, mc: 0.5, season: 0.3 },
    ];
    const body = async (p: Props) => (await openRules(p)).get('[data-testid="duel-rules-body"]').text();
    expect(await body({ weights })).toContain(
      '色看火候, 香看调味、厨艺, 味看火候、调味, 形看刀工、火候, 养看调味、刀工、在售的特色菜',
    );
    // 一项的系数全是 0：只看随机分（审查 Minor）
    const allZero = [z, ...weights.slice(1)];
    expect(await body({ weights: allZero })).toContain('色只看随机分');
    // 没给权重（旧接口）时用原来的说明
    expect(await body({})).toContain('色看厨艺、刀工');
  });

  it('有特色菜那一项时写明不算试炼价值（集束飞弹那次的遗留：只在试炼说明里写了）', async () => {
    const z = { cook: 1, cutting: 0, fire: 0, season: 0, mc: 0 };
    const note = '特色菜按每份原本的价值算, 不加试炼价值。';
    expect((await openRules()).get('[data-testid="duel-rules-mc"]').text()).toBe(note);
    const withMc = [z, z, z, z, { ...z, mc: 0.5 }];
    expect((await openRules({ weights: withMc })).get('[data-testid="duel-rules-body"]').text()).toContain(
      note,
    );
    const noMc = [z, z, z, z, z];
    expect((await openRules({ weights: noMc })).find('[data-testid="duel-rules-mc"]').exists()).toBe(false);
  });
});

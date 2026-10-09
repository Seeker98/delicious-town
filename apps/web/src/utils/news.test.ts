import { describe, expect, it } from 'vitest';
import { NEWS_TYPES, SHARED_GOODS, type NewsDto } from '@dt/shared';
import { loadMessages, setActive } from '../i18n';
import { newsRendered, newsText } from './news';
import { rewardText } from './rewards';

const names = {
  goodsName: (id: number) => `道具${id}`,
  foodName: (id: number) => `食材${id}`,
  mcName: (id: number) => `特色菜${id}`,
  weatherName: (id: number) => (id === 1 ? '晴' : id === 13 ? '暴雨' : `天气${id}`),
  streetName: (id: number) => `街${id}`,
  seedName: (id: number) => `种子${id}`,
};
const n = (
  type: string,
  params: Record<string, unknown> = {},
  restName: string | null = '小王的店',
): NewsDto => ({
  id: 1,
  type,
  restId: restName ? 7 : null,
  restName,
  params,
  createdAt: '2026-09-30T04:00:00.000Z',
});

describe('新闻文案', () => {
  it('买限定称号（240-2）：称号名按目录取（跟着语言），目录里没有时用新闻里记的名字', () => {
    const p = { key: 'oct26_l', title: '金秋食神' };
    expect(newsText(n('icon.buy', p), { ...names, icon: () => ({ title: 'Autumn Gourmet God' }) })).toBe(
      '小王的店买下了限定称号「Autumn Gourmet God」',
    );
    expect(newsText(n('icon.buy', p), names)).toBe('小王的店买下了限定称号「金秋食神」');
  });

  it('猜酒杯改版（问题记录 427-5）：新闻写闯过几轮；改版前的旧新闻照旧写连中几次', () => {
    expect(newsText(n('bar.cup', { round: 3, cups: 5 }), names)).toBe(
      '小王的店在酒吧猜酒杯连闯 3 轮, 从 5 个杯子里猜中了骰子',
    );
    expect(newsText(n('bar.cup.big', { round: 4, cups: 7 }), names)).toBe(
      '小王的店在酒吧猜酒杯闯过全部 4 轮, 从 7 个杯子里猜中了骰子！',
    );
    expect(newsText(n('bar.cup', { times: 4, lucky: false }), names)).toBe('小王的店在酒吧猜酒杯连中 4 次');
  });

  it('豪华一番赏的新闻写“豪华一番赏”（240-2）', () => {
    expect(newsText(n('kuji.big', { tier: 'A', line: 'deluxe' }), names)).toContain('豪华一番赏');
    expect(newsText(n('kuji.big', { tier: 'last', line: 'deluxe' }), names)).toContain('豪华一番赏');
    expect(newsText(n('kuji.win', { tier: 'B', line: 'deluxe' }), names)).toContain('豪华一番赏');
    expect(newsText(n('kuji.big', { tier: 'A' }), names)).not.toContain('豪华');
  });

  it('小镇发展基金（240-2）：按档位选句子，店名带【】，金额按实际；不认识的档位用通用句', () => {
    expect(newsText(n('fund.big', { tier: 'A', coin: 10_000_000 }), names)).toBe(
      '👑 基石资本强势进场！【小王的店】一次性注资 10,000,000 银币, 斩获小镇发展基金 A 级领投席位！',
    );
    expect(newsText(n('fund.deposit', { tier: 'B', coin: 3_000_000 }), names)).toBe(
      '大手笔！【小王的店】成功锁仓 3,000,000 银币小镇发展基金 B 类份额！',
    );
    expect(newsText(n('fund.deposit', { tier: 'C', coin: 1_000_000 }), names)).toBe(
      '实体经济复苏！【小王的店】认购了 1,000,000 银币小镇发展基金 C 类份额',
    );
    expect(newsText(n('fund.deposit', { tier: 'D', coin: 500_000 }), names)).toBe(
      '【小王的店】向小镇发展基金存入 500,000 银币',
    );
    expect(newsText(n('fund.big', { tier: 'C', coin: 1_000_000 }), names)).toBe(
      '实体经济复苏！【小王的店】认购了 1,000,000 银币小镇发展基金 C 类份额',
    );
  });

  it('代码里每种新闻类型都有文案', () => {
    expect(NEWS_TYPES.filter((x) => !newsRendered().includes(x))).toEqual([]);
  });

  it('小镇新增的几种', () => {
    expect(newsText(n('town.broadcast', { text: '大家好' }), names)).toBe('小王的店: 大家好');
    expect(newsText(n('town.bless', { blessId: 1, name: '五谷丰登' }), names)).toBe(
      '小王的店许愿得到星愿: 五谷丰登',
    );
    expect(newsText(n('town.shake.lucky', { goodsId: 180, num: 1 }), names)).toBe(
      '恭喜小王的店伸进蟹老板裤兜里掏出: 道具180×1',
    );
    expect(newsText(n('town.exchange', { exchangeId: 2, goodsId: 238, num: 1 }), names)).toBe(
      '小王的店在镇长大胃锅处兑换了 道具238×1',
    );
    expect(newsText(n('kuji.big', { tier: 'A' }), names)).toBe('小王的店在一番赏抽中了 A 赏！');
    expect(newsText(n('kuji.big', { tier: 'last' }), names)).toBe(
      '小王的店抽走了一番赏的最后一张签, 拿下最后赏！',
    );
    expect(newsText(n('kuji.win', { tier: 'B' }), names)).toBe('小王的店在一番赏抽中了 B 赏');
  });

  it('事件预测开奖（问题记录 268）：结果、参与和押对的店数、派出银币；作废写退款比例；没人押对时不写派出', () => {
    const r = (p: Record<string, unknown>) => newsText({ ...n('predict.result', p), restName: null }, names);
    expect(r({ title: '明天会下雨吗', outcome: true, players: 12, winners: 7, paid: 85000 })).toBe(
      '事件预测「明天会下雨吗」开奖: 结果为是。12 家店参与, 7 家押对, 共派出 85,000 银币',
    );
    expect(r({ title: '蟹老板去三街吗', outcome: false, players: 3, winners: 0, paid: 0 })).toBe(
      '事件预测「蟹老板去三街吗」开奖: 结果为否。3 家店参与, 没有人押对',
    );
    expect(r({ title: '没人玩', outcome: true, players: 0, winners: 0, paid: 0 })).toBe(
      '事件预测「没人玩」开奖: 结果为是',
    );
    expect(r({ title: '题目写错了', outcome: null, voidRatio: 0.85, players: 4 })).toBe(
      '事件预测「题目写错了」已作废, 参与的店按净投入的 85% 退款',
    );
    // 自动题按题型和参数渲染题目（问题记录 272）
    expect(
      r({
        title: '旧题目',
        kind: 'krab',
        eventParams: { from: 3, to: 8 },
        outcome: true,
        players: 0,
        winners: 0,
        paid: 0,
      }),
    ).toBe('事件预测「明天蟹老板会在 3~8 号街出现吗」开奖: 结果为是');
  });

  it('嘻哈男孩和手动进货（4E-2）', () => {
    expect(newsText(n('hiphop.event'), names)).toBe('小王的店开启了嘻哈活动！');
    expect(newsText(n('hiphop.krab', { num: 4 }), names)).toBe(
      `小王的店通过打赏获得 道具${SHARED_GOODS.krabCoin}×4`,
    );
    expect(newsText(n('hiphop.weekly', { rank: 2, goodsId: 109 }), names)).toBe(
      '恭喜小王的店在每周打赏中获得第 2 名, 奖励 道具109 (160 小时)',
    );
    expect(newsText(n('market.manual', { foods: [3, 5] }), names)).toBe('小王的店已进货日常菜: 食材3、食材5');
  });

  it('目录里已经没有的星愿（下架去掉了）：英西法不显示中文名，写“一个星愿”；简中照旧（backlog）', async () => {
    const gone = n('town.bless', { blessId: 999, blessName: '五谷丰登' });
    expect(newsText(gone, names)).toBe('小王的店许愿得到星愿: 五谷丰登');
    setActive('en', await loadMessages('en'));
    try {
      const text = newsText(gone, names);
      expect(text).not.toContain('五谷丰登');
      expect(text).toBe('小王的店 made a wish and received: a star wish');
    } finally {
      setActive('zh-CN', await loadMessages('zh-CN'));
    }
  });

  it('星愿名不再占用店名字段：店不存在时显示"某家餐厅"（PR26 遗留）', () => {
    expect(newsText(n('town.bless', { blessId: 1, blessName: '五谷丰登' }, null), names)).toBe(
      '某家餐厅许愿得到星愿: 五谷丰登',
    );
    expect(newsText(n('town.bless', { blessId: 1, name: '五谷丰登' }), names)).toBe(
      '小王的店许愿得到星愿: 五谷丰登',
    );
  });

  it('论坛（4E-3）', () => {
    expect(newsText(n('forum.feature', { postId: 3, title: '攻略' }), names)).toBe(
      '小王的店的帖子《攻略》被加精了',
    );
    expect(newsText(n('forum.pin', { postId: 3, title: '公告' }), names)).toBe(
      '小王的店的帖子《公告》被置顶了',
    );
  });

  it('换天气：雷神锤写明是谁；自动轮换没有店名', () => {
    expect(newsText(n('weather.change', { from: 1, to: 13, by: 7 }), names)).toBe(
      '小王的店使用雷神锤, 晴转暴雨了',
    );
    expect(newsText(n('weather.change', { from: 1, to: 13 }, null), names)).toBe('天气变了: 晴转暴雨');
  });

  it('店不存在时用新闻里记下的名字，都没有时写"某家餐厅"；未知类型不报错', () => {
    expect(newsText(n('star.up', { star: 2, name: '旧名' }, null), names)).toBe('旧名升到了 2 星');
    expect(newsText(n('star.up', { star: 2 }, null), names)).toBe('某家餐厅升到了 2 星');
    expect(newsText(n('no.such.type'), names)).toBe('小镇发生了一件事');
  });
});

describe('奖励文案', () => {
  it('食材、道具、种子、银币、钻石', () => {
    expect(rewardText({ kind: 'foods', id: 101, num: 2 }, names)).toBe('食材101×2');
    expect(rewardText({ kind: 'goods', id: 20, num: 1 }, names)).toBe('道具20×1');
    expect(rewardText({ kind: 'seed', id: 3, num: 1 }, names)).toBe('种子3×1');
    expect(rewardText({ kind: 'coin', id: null, num: 200000 }, names)).toBe('银币 200,000');
    expect(rewardText({ kind: 'diamond', id: null, num: 5 }, names)).toBe('钻石 5');
  });
});

describe('全服合力贡献榜新闻（148-3）', () => {
  it('列出名次、店名和积分', () => {
    expect(
      newsText(
        n(
          'activity.coopRank',
          {
            title: '国庆合力',
            top: [
              { rank: 1, name: '甲餐厅', points: 1234 },
              { rank: 2, name: '乙餐厅', points: 1100 },
            ],
          },
          null,
        ),
        names,
      ),
    ).toBe('《国庆合力》贡献榜: 第 1 名 甲餐厅 (1,234 分)、第 2 名 乙餐厅 (1,100 分)');
  });
});

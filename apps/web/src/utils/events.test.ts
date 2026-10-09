import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { activeMessages } from '../i18n';
import { useLocaleStore } from '../stores/locale';
import { eventText, eventsSummary, logText, mergeEvents, recordLabel } from './events';

const names = { goodsName: (id: number) => ({ 1: '神秘礼券' })[id] ?? `道具${id}`, foodName: () => '大米' };

describe('得失提示文案', () => {
  it('银币、道具、食材、幸运', () => {
    expect(eventText({ type: 'gain', kind: 'coin', num: 1500 }, names)).toBe('获得 银币 1,500');
    expect(eventText({ type: 'loss', kind: 'coin', num: 200 }, names)).toBe('消耗 银币 200');
    expect(eventText({ type: 'gain', kind: 'goods', id: 1, num: 3, lucky: true }, names)).toBe(
      '获得 神秘礼券×3 (幸运)',
    );
    expect(eventText({ type: 'gain', kind: 'foods', id: 101, num: 2 }, names)).toBe('获得 大米×2');
  });
});

describe('个人日志文案', () => {
  it('升级、老鼠、蟹老板', () => {
    expect(logText({ type: 'level.up', params: { from: 1, to: 3 }, at: '' }, names)).toBe('餐厅升到了 3 级');
    expect(logText({ type: 'mouse.steal', params: { foodsId: 101, num: 2 }, at: '' }, names)).toBe(
      '老鼠偷走了 大米×2',
    );
    expect(logText({ type: 'krab.angry', params: {}, at: '' }, names)).toBe('蟹老板扫兴而归');
    expect(logText({ type: 'unknown.type', params: {}, at: '' }, names)).toBe('unknown.type');
    expect(logText({ type: 'admin.grant', params: { reason: '停服补偿' }, at: '' }, names)).toBe(
      '系统补偿: 停服补偿',
    );
    expect(logText({ type: 'mail.claim', params: { title: '开服礼' }, at: '' }, names)).toBe(
      '领取了邮件「开服礼」的附件',
    );
    // 系统邮件按模板渲染标题（问题记录 272）
    expect(
      logText(
        { type: 'mail.claim', params: { title: '旧', tpl: { key: 'invite.welcome', params: {} } }, at: '' },
        names,
      ),
    ).toBe('领取了邮件「欢迎来到小镇」的附件');
    expect(
      logText({ type: 'admin.rename', params: { from: 'A', to: 'B', reason: '违规' }, at: '' }, names),
    ).toBe('管理员把店名从「A」改为「B」: 违规');
    expect(logText({ type: 'redeem', params: { code: 'KAIFU' }, at: '' }, names)).toBe('使用了兑换码 KAIFU');
    expect(logText({ type: 'market.guess.refund', params: { period: '2026-09-30@10' }, at: '' }, names)).toBe(
      '菜场竞猜 2026-09-30 10 点那一轮没有开奖, 退还了报名费',
    );
  });
});

describe('mergeEvents（问题记录：一次得到很多东西时提示刷屏）', () => {
  it('同类型、同物品、同幸运标记的事件合并数量，保持首次出现的顺序', () => {
    expect(
      mergeEvents([
        { type: 'gain', kind: 'foods', id: 101, num: 2 },
        { type: 'gain', kind: 'coin', num: 5 },
        { type: 'gain', kind: 'foods', id: 101, num: 1 },
        { type: 'gain', kind: 'foods', id: 101, num: 1, lucky: true },
        { type: 'loss', kind: 'goods', id: 131, num: 99 },
      ]),
    ).toEqual([
      { type: 'gain', kind: 'foods', id: 101, num: 3 },
      { type: 'gain', kind: 'coin', num: 5 },
      { type: 'gain', kind: 'foods', id: 101, num: 1, lucky: true },
      { type: 'loss', kind: 'goods', id: 131, num: 99 },
    ]);
  });
});

describe('特色菜（子项目 4A）', () => {
  const names = {
    goodsName: (id: number) => `道具${id}`,
    foodName: (id: number) => `食材${id}`,
    mcName: (id: number) => `秘·${id}`,
  };
  it('残卷事件显示特色菜名', () => {
    expect(eventText({ type: 'gain', kind: 'remnant', id: 7, num: 2 }, names)).toBe('获得 秘·7残卷×2');
  });
  it('学会、遗忘的日志', () => {
    const at = '2026-09-30T00:00:00Z';
    expect(logText({ type: 'mc.learn', params: { mcId: 7, via: 'remnant' }, at } as never, names)).toBe(
      '学会了特色菜「秘·7」',
    );
    expect(
      logText({ type: 'mc.forget', params: { cookbooks: [1, 2, 3], mcId: 9 }, at } as never, names),
    ).toBe('偷学失败, 遗忘了 3 道食谱和特色菜「秘·9」');
    // 问题记录 424 以后：记了 grades 的是降品级（以前的日志没有 grades，照旧写遗忘）
    expect(
      logText(
        { type: 'mc.forget', params: { cookbooks: [1, 2, 3], mcId: null, grades: 1, lost: 2 }, at } as never,
        names,
      ),
    ).toBe('偷学失败, 3 道食谱降了 1 品, 其中 2 道忘了');
  });
});

describe('餐厅动态新类型（问题记录 553）', () => {
  const names = { goodsName: () => '神秘礼券', foodName: () => '大米' };
  const at = '2026-10-09T00:00:00Z';
  const text = (type: string, params: Record<string, unknown>) => logText({ type, params, at }, names);
  it('白食者吃完走了', () => {
    expect(text('dine.left', { byName: '甲', table: 3, coin: 120 })).toBe(
      '甲 在你店里第 3 桌吃完白食走了, 吃走了 120 银币',
    );
  });
  it('帖子被回复：回复帖子、回复某一层；匿名写"有人"', () => {
    expect(text('forum.replied', { byName: '甲', postId: 5, title: '求助', floor: 2 })).toBe(
      '甲 回复了你的帖子「求助」',
    );
    expect(text('forum.replied', { byName: '甲', postId: 5, title: '求助', floor: 3, toFloor: 2 })).toBe(
      '甲 回复了你在「求助」的 #2',
    );
    expect(text('forum.replied', { postId: 5, title: '求助', floor: 2 })).toBe('有人 回复了你的帖子「求助」');
  });
  it('手动进货被买：新记录写买家和分成，旧记录照旧', () => {
    expect(text('market.share', { foodsId: 1, num: 10, byName: '乙', coin: 1250 })).toBe(
      '乙 买走了你手动进货的 大米×10, 你分得 1,250 银币',
    );
    expect(text('market.share', { foodsId: 1, num: 10 })).toBe('你手动进货的 大米×10 被买走了');
  });
  it('被雇当骑手', () => {
    expect(text('takeaway.hired', { byName: '丙' })).toBe('丙 雇你当了外卖骑手');
  });
});

describe('终审：流水名称和个人日志里的好友动态', () => {
  const names = { goodsName: () => '神秘礼券', foodName: () => '大米', mcName: (id: number) => `秘·${id}` };
  const at = '2026-09-30T00:00:00Z';
  it('流水：道具、食材、残卷显示名称，资源显示中文', () => {
    expect(recordLabel({ kind: 'remnant', itemId: 7 }, names)).toBe('秘·7残卷');
    expect(recordLabel({ kind: 'goods', itemId: 1 }, names)).toBe('神秘礼券');
    expect(recordLabel({ kind: 'foods', itemId: 101 }, names)).toBe('大米');
    expect(recordLabel({ kind: 'coin', itemId: null }, names)).toBe('银币');
  });
  it('好友动态类型在个人日志里也有文案，不显示英文类型名', () => {
    expect(logText({ type: 'mc.eaten', params: { byName: '甲' }, at } as never, names)).toBe(
      '甲 品尝了你的特色菜',
    );
    expect(logText({ type: 'thumb', params: { byName: '甲' }, at } as never, names)).toBe('甲 给你点了赞');
  });
});

describe('神殿（子项目 4B-1）', () => {
  const names = {
    goodsName: () => '道具',
    foodName: (id: number) => `食材${id}`,
    mcName: (id: number) => `秘·${id}`,
    seedName: (id: number) => `种子${id}`,
  };
  const at = '2026-09-30T00:00:00Z';
  it('种子事件和流水显示种子名', () => {
    expect(eventText({ type: 'gain', kind: 'seed', id: 5, num: 3 }, names)).toBe('获得 种子5×3');
    expect(recordLabel({ kind: 'seed', itemId: 5 }, names)).toBe('种子5');
  });
  it('试炼、克拉肯遗忘的日志', () => {
    expect(
      logText(
        { type: 'temple.trial', params: { mcId: 3, success: true, worth: 1, exp: 2 }, at } as never,
        names,
      ),
    ).toBe('「秘·3」试炼成功: 试炼价值 +1%、试炼经验 +2%');
    expect(logText({ type: 'temple.trial', params: { mcId: 3, success: false }, at } as never, names)).toBe(
      '「秘·3」试炼失败',
    );
    expect(logText({ type: 'kraken.forget', params: { mcId: 3 }, at } as never, names)).toBe(
      '克拉肯很不满意, 你遗忘了特色菜「秘·3」',
    );
  });
});

describe('菜园（子项目 4B-2）', () => {
  it('菜篮的得失提示和流水名称；好友动态', () => {
    expect(eventText({ type: 'gain', kind: 'basket', id: 101, num: 21 }, names)).toBe('获得 菜篮·大米×21');
    expect(recordLabel({ kind: 'basket', itemId: 101 }, names)).toBe('菜篮·大米');
    expect(
      logText({ type: 'yard.helped', params: { byName: '乙店', what: 'weed', foodsId: 101 }, at: '' }, names),
    ).toBe('乙店 帮你的大米除了草');
    expect(
      logText(
        { type: 'yard.stolen', params: { byName: '乙店', foodsId: 101, num: 2, punished: null }, at: '' },
        names,
      ),
    ).toBe('乙店 偷走了你的 大米×2');
    expect(
      logText(
        { type: 'yard.stolen', params: { byName: '乙店', foodsId: 101, num: 1, punished: 101 }, at: '' },
        names,
      ),
    ).toBe('乙店 偷走了你的 大米×1, 被边牧逮住, 留下了 大米');
  });
});

describe('一次操作的得失合成一条提示（问题记录：弹出的消息框太多）', () => {
  it('获得在前、消耗在后，同类合并', () => {
    expect(
      eventsSummary(
        [
          { type: 'gain', kind: 'coin', num: 5 },
          { type: 'loss', kind: 'strength', num: 1 },
          { type: 'gain', kind: 'exp', num: 5 },
          { type: 'gain', kind: 'foods', id: 101, num: 1 },
          { type: 'gain', kind: 'foods', id: 101, num: 2 },
        ],
        names,
      ),
    ).toBe('获得 银币 5、经验 5、大米×3；消耗 体力 1');
    expect(eventsSummary([{ type: 'loss', kind: 'goods', id: 1, num: 2 }], names)).toBe('消耗 神秘礼券×2');
  });

  it('太多时只列前 8 项，后面写"等 N 项"', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      type: 'gain' as const,
      kind: 'goods' as const,
      id: 100 + i,
      num: 1,
    }));
    const text = eventsSummary(many, names);
    expect(text.split('、')).toHaveLength(8);
    expect(text.endsWith('等 11 项')).toBe(true);
  });
});
describe('问题记录 154：酒吧、外卖的日志有中文文案', () => {
  it('记忆调酒、外卖领取', () => {
    expect(logText({ type: 'bar.memory', params: { level: 3, correct: false }, at: '' }, names)).toBe(
      '记忆调酒第 3 关没调对',
    );
    expect(logText({ type: 'takeaway.claim', params: { success: true, coin: 1200 }, at: '' }, names)).toBe(
      '外卖送达, 获得银币 1,200',
    );
  });
});

describe('问题记录 224：活动货币', () => {
  it('提示里写货币名和个数，注明是活动货币；同名的合并', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const e = { type: 'gain' as const, kind: 'activityCurrency' as const, name: '马勋章', num: 1 };
    expect(eventsSummary([e, e, { ...e, name: '猫勋章' }], names)).toBe(
      '获得 马勋章×2 (活动货币)、猫勋章×1 (活动货币)',
    );
  });
});

describe('交易所日志（156-1）', () => {
  it('挂单、被动成交、撤单、过期、取出都有文案', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(log('exchange.order', { side: 'buy', foodsId: 3, price: 100, qty: 5, filled: 2 })).toBe(
      '在交易所挂买单: 食材3 ×5, 单价 100 (当场成交 2 个)',
    );
    expect(log('exchange.fill', { side: 'sell', foodsId: 3, price: 100, qty: 2, fee: 10 })).toBe(
      '交易所卖单成交: 食材3 ×2, 单价 100, 手续费 10 (所得在交易所账户)',
    );
    expect(log('exchange.cancel', { side: 'sell', foodsId: 3, price: 100, left: 1 })).toBe(
      '撤销交易所卖单: 食材3, 退回 1 个',
    );
    expect(log('exchange.expire', { side: 'buy', foodsId: 3, price: 100, left: 1 })).toBe(
      '交易所买单过期: 食材3, 剩余 1 个的冻结退回交易所账户',
    );
    expect(log('exchange.withdraw', { coin: 950, foods: [{ foodsId: 3, num: 2 }] })).toBe(
      '从交易所账户取出: 银币 950、食材3×2',
    );
    expect(log('exchange.fill', { side: 'buy', foodsId: 3, price: 100, qty: 2, fee: 0, held: true })).toBe(
      '交易所买单成交: 食材3 ×2, 单价 100 (可疑成交, 所得冻结 24 小时)',
    );
  });

  it('交易所冻结撤单、没收、按区服设置的冻结小时数（backlog 156-2）', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(
      log('exchange.fill', {
        side: 'buy',
        foodsId: 3,
        price: 100,
        qty: 2,
        fee: 0,
        held: true,
        holdHours: 48,
      }),
    ).toBe('交易所买单成交: 食材3 ×2, 单价 100 (可疑成交, 所得冻结 48 小时)');
    expect(log('exchange.freezeCancel', { side: 'sell', foodsId: 3, price: 100, left: 2 })).toBe(
      '交易所被冻结, 卖单撤销: 食材3, 剩余 2 个退回交易所账户',
    );
    expect(log('exchange.confiscate', { coin: 950, foods: [{ foodsId: 3, num: 2 }] })).toBe(
      '交易所冻结中的所得被没收: 银币 950、食材3×2',
    );
  });

  it('发展基金日志（backlog 基金）', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(log('fund.deposit', { tier: 'B', coin: 3000000 })).toBe(
      '向小镇发展基金存入 3,000,000 银币 (B·增值资本)',
    );
    expect(log('fund.claim', { tier: 'B', coin: 2700000, medal: 93102 })).toBe(
      '领取小镇发展基金: 拿回 2,700,000 银币和道具93102',
    );
    expect(log('fund.withdraw', { tier: 'C', coin: 700000 })).toBe('提前取出小镇发展基金, 拿回 700,000 银币');
  });

  it('一番赏日志', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(log('kuji.buy', { num: 3, coin: 60000 })).toBe('买了一番赏抽赏券 ×3, 花费 60,000 银币');
    // 活跃奖励另送的券（backlog 一番赏）
    expect(log('kuji.activation', { points: 150, num: 1 })).toBe('领取活跃 150 点奖励, 另得一番赏抽赏券 ×1');
    expect(log('kuji.draw', { seq: 2, num: 3, tiers: { A: 1, F: 2 }, last: true })).toBe(
      '一番赏第 2 池抽了 3 张: A 赏 ×1、F 赏 ×2, 并拿下最后赏',
    );
    // 豪华一番赏（240-2 终审）：记录写明是豪华签券、豪华池
    expect(log('kuji.buy', { num: 2, coin: 600000, line: 'deluxe' })).toBe(
      '买了豪华签券 ×2, 花费 600,000 银币',
    );
    expect(log('kuji.draw', { seq: 1, num: 1, tiers: { D: 1 }, last: false, line: 'deluxe' })).toBe(
      '豪华一番赏第 1 池抽了 1 张: D 赏 ×1',
    );
  });

  it('事件合约日志（238-1）', () => {
    const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };
    const log = (type: string, params: Record<string, unknown>) => logText({ type, params, at: '' }, names);
    expect(
      log('predict.trade', { title: '会下雨吗', side: 'yes', dir: 'buy', qty: 3, amount: 1500, fee: 30 }),
    ).toBe('预测「会下雨吗」买入是 3 份, 成交额 1,500, 手续费 30');
    expect(log('predict.settle', { title: '会下雨吗', outcome: true, coin: 3000 })).toBe(
      '预测「会下雨吗」结果为是, 结算得到 3,000 银币',
    );
    expect(log('predict.refund', { title: '会下雨吗', coin: 1530 })).toBe(
      '预测「会下雨吗」已作废, 退回 1,530 银币',
    );
    // 带净投入时写出本局盈亏（问题记录 254）
    expect(log('predict.settle', { title: '会下雨吗', outcome: false, coin: 0, net: 2500 })).toBe(
      '预测「会下雨吗」结果为否, 结算得到 0 银币, 本局盈亏 -2,500',
    );
    expect(log('predict.settle', { title: '会下雨吗', outcome: true, coin: 4000, net: 2500 })).toBe(
      '预测「会下雨吗」结果为是, 结算得到 4,000 银币, 本局盈亏 +1,500',
    );
    expect(log('predict.refund', { title: '会下雨吗', coin: 900, net: 1000 })).toBe(
      '预测「会下雨吗」已作废, 退回 900 银币, 本局盈亏 -100',
    );
  });
});

describe('流水名称按语言（fix/batch-1008 遗留：道具流水只测了简中）', () => {
  afterEach(async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('zh-CN');
  });
  const en = {
    goodsName: () => 'Mystery Voucher',
    foodName: () => 'Rice',
    mcName: (id: number) => `Dish ${id}`,
  };

  it('英文：资源、残卷、种子、菜篮的名称都是英文，不夹中文', async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('en');
    const labels = ['coin', 'diamond', 'exp', 'renown', 'remnant', 'seed', 'basket'].map((kind) =>
      recordLabel({ kind, itemId: 7 }, en),
    );
    expect(labels.filter((x) => /[\u4e00-\u9fff]/.test(x))).toEqual([]);
    expect(recordLabel({ kind: 'coin', itemId: null }, en)).toBe(activeMessages().events.kind.coin);
    expect(recordLabel({ kind: 'remnant', itemId: 7 }, en)).toContain('Dish 7');
  });
});

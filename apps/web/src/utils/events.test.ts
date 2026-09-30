import { describe, expect, it } from 'vitest';
import { eventText, logText, mergeEvents } from './events';

const names = { goodsName: (id: number) => ({ 1: '神秘礼券' })[id] ?? `道具${id}`, foodName: () => '大米' };

describe('得失提示文案', () => {
  it('银币、道具、食材、幸运', () => {
    expect(eventText({ type: 'gain', kind: 'coin', num: 1500 }, names)).toBe('获得 银币 1,500');
    expect(eventText({ type: 'loss', kind: 'coin', num: 200 }, names)).toBe('消耗 银币 200');
    expect(eventText({ type: 'gain', kind: 'goods', id: 1, num: 3, lucky: true }, names)).toBe(
      '获得 神秘礼券×3（幸运）',
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
      '系统补偿：停服补偿',
    );
    expect(
      logText({ type: 'admin.rename', params: { from: 'A', to: 'B', reason: '违规' }, at: '' }, names),
    ).toBe('管理员把店名从「A」改为「B」：违规');
    expect(logText({ type: 'market.guess.refund', params: { period: '2026-09-30@10' }, at: '' }, names)).toBe(
      '菜场竞猜 2026-09-30 10 点那一轮没有开奖，退还了报名费',
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
    ).toBe('偷学失败，遗忘了 3 道食谱和特色菜「秘·9」');
  });
});

import { describe, expect, it } from 'vitest';
import type { RestLogDto } from '@dt/shared';
import { logText } from './events';

const at = '2026-09-30T00:00:00.000Z';
/** 动态的文案走 logText（backlog 1010：原来的 describeFeed 只剩测试在用，删了） */
const describeFeed = (item: RestLogDto, foodName: (id: number) => string) =>
  logText(item, { foodName, goodsName: (id) => `道具${id}` });
const food = (id: number) => `食材${id}`;

describe('好友动态文案', () => {
  it('各种互动', () => {
    expect(describeFeed({ type: 'thumb', params: { byName: '甲' }, at }, food)).toBe('甲 给你点了赞');
    expect(describeFeed({ type: 'roach.laid', params: { byName: '甲', table: 3 }, at }, food)).toBe(
      '甲 在你店里第 3 桌放了一只蟑螂',
    );
    expect(
      describeFeed({ type: 'friend.flip', params: { byName: '甲', outcome: 'food', foodsId: 7 }, at }, food),
    ).toBe('甲 翻了你的橱柜, 拿走了 食材7');
    expect(
      describeFeed({ type: 'friend.flip', params: { byName: '甲', outcome: 'caught', coin: 50 }, at }, food),
    ).toBe('甲 翻你的橱柜被老鼠夹夹住, 掉了 50 银币给你');
    expect(describeFeed({ type: 'dine.expelled', params: { byName: '乙', coin: 10 }, at }, food)).toBe(
      '乙 把你请出了店, 你赔了 10 银币',
    );
    expect(describeFeed({ type: 'weird', params: {}, at }, food)).toBe('weird');
  });
});

describe('特色菜动态', () => {
  const at = '2026-09-30T00:00:00Z';
  it('品尝、课堂', () => {
    expect(
      describeFeed(
        { type: 'mc.eaten', params: { byName: '甲', mcId: 1, portions: 2 }, at } as never,
        () => '',
      ),
    ).toBe('甲 品尝了你的特色菜');
    expect(
      describeFeed(
        { type: 'lesson.taught', params: { byName: '甲', type: 2, success: true }, at } as never,
        () => '',
      ),
    ).toBe('甲 在你的课上偷学成功');
    expect(
      describeFeed(
        { type: 'lesson.taught', params: { byName: '甲', type: 1, success: false }, at } as never,
        () => '',
      ),
    ).toBe('甲 在你的课上没学会');
  });
});

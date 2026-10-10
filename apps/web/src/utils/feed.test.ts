import { describe, expect, it } from 'vitest';
import type { RestLogDto } from '@dt/shared';
import { logText } from './events';
import { feedLink } from './feed';

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

describe('动态的链接（问题记录 587）', () => {
  const item = (type: string, params: Record<string, unknown>) =>
    ({ type, params, at: '2026-10-11T00:00:00Z' }) as RestLogDto;
  it('带对方餐厅编号的好友互动点了去对方餐厅；帖子被回复照旧去帖子；没有对方的不链接', () => {
    expect(feedLink(item('roach.laid', { by: 42, byName: '老王', table: 3 }))).toBe('/friends/42');
    expect(feedLink(item('exchange', { by: 7, give: 3069, take: 3046, result: 'ok' }))).toBe('/friends/7');
    expect(feedLink(item('forum.replied', { by: 42, postId: 9 }))).toBe('/forum/9');
    expect(feedLink(item('mouse.steal', { foodsId: 1, num: 2 }))).toBeNull();
    expect(feedLink(item('thumb', { by: '42' }))).toBeNull();
  });
});

describe('交换食材的动态写明用什么换走了什么（问题记录 587）', () => {
  const names = {
    foodName: (id: number) => (id === 1 ? '肉粉' : '火腿'),
    goodsName: (id: number) => `道具${id}`,
    foodLevel: () => 3,
  };
  it('成功和被抓都写明双方食材和等级；旧日志没有 give / take 时照旧', () => {
    expect(
      logText({ type: 'exchange', params: { byName: '甲', give: 1, take: 2, result: 'ok' }, at }, names),
    ).toBe('甲 用 1 个肉粉 (3 级) 换走了你的 1 个火腿 (3 级)');
    expect(
      logText({ type: 'exchange', params: { byName: '甲', give: 1, take: 2, result: 'caught' }, at }, names),
    ).toBe('甲 想用肉粉 (3 级) 偷换你锁定的火腿 (3 级), 被抓住了, 赔给你 2 个肉粉');
    expect(logText({ type: 'exchange', params: { byName: '甲', result: 'ok' }, at }, names)).toBe(
      '甲 和你交换了食材',
    );
  });
});

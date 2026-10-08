import { describe, expect, it } from 'vitest';
import { checkArticle, parseArticle, sameTokens, toTw } from './check';
import type { DailyFacts } from './facts';

const facts: DailyFacts = {
  day: '2026-10-07',
  shopCount: 10,
  summary: ['天气: {w:1} → {w:17}'],
  topIncome: [{ rest: '{r:12}', coin: 900 }],
  events: [{ kind: '强化', text: '{r:7} 把 {g:40605} 强化到了 +10', newsId: 1 }],
  names: { 'g:40605': '铲子', 'w:1': '晴', 'w:17': '小雨' },
};
const body = (n: number, extra = '') => `${extra}${'镇'.repeat(n)}`;
const zh = (o: Partial<{ title: unknown; body: unknown }> = {}) =>
  JSON.stringify({ title: '昨天的小镇', body: body(300, '{r:7} 把 {g:40605} 强化到 +10。\n\n'), ...o });

describe('小镇日报：解析和检查 AI 的输出', () => {
  it('合法的通过；标题、正文去掉首尾空白', () => {
    const a = parseArticle(JSON.stringify({ title: ' 昨天的小镇 ', body: ` ${body(300)} ` }), 'zh-CN', 250);
    expect(a.title).toBe('昨天的小镇');
    expect(a.body).toBe(body(300));
    expect(() => checkArticle(parseArticle(zh(), 'zh-CN', 250), facts)).not.toThrow();
  });

  it('JSON 坏、缺字段、标题太长、正文太短或太长都不行', () => {
    expect(() => parseArticle('不是 JSON', 'zh-CN', 250)).toThrow('json');
    expect(() => parseArticle(JSON.stringify({ title: 't' }), 'zh-CN', 250)).toThrow('body');
    expect(() => parseArticle(zh({ title: '长'.repeat(25) }), 'zh-CN', 250)).toThrow('title');
    expect(() => parseArticle(zh({ body: body(100) }), 'zh-CN', 250)).toThrow('body');
    expect(() => parseArticle(zh({ body: body(100) }), 'zh-CN', 80)).not.toThrow();
    expect(() => parseArticle(zh({ body: body(700) }), 'zh-CN', 80)).toThrow('body');
    expect(() => parseArticle(JSON.stringify({ title: 'A'.repeat(91), body: 'x' }), 'en', 1)).toThrow(
      'title',
    );
  });

  it('记号必须是素材里有的；不能有网址和尖括号', () => {
    const ok = { title: '昨天', body: '{r:12} 收入最高, {w:17} 来了' };
    expect(() => checkArticle(ok, facts)).not.toThrow();
    expect(() => checkArticle({ ...ok, body: '{r:999} 来了' }, facts)).toThrow('r:999');
    expect(() => checkArticle({ ...ok, title: '{g:1} 来了' }, facts)).toThrow('g:1');
    for (const bad of ['看 http://x.cn', '去 www.abc 看', '上 dt.com 看', '<b>粗</b>'])
      expect(() => checkArticle({ ...ok, body: bad }, facts), bad).toThrow();
  });

  it('英文的记号要和简中一模一样', () => {
    const a = { title: 't', body: '{r:7} {g:40605} {r:7}' };
    expect(() => sameTokens(a, { title: 't', body: '{g:40605} {r:7} and {r:7}' })).not.toThrow();
    expect(() => sameTokens(a, { title: 't', body: '{g:40605} {r:7}' })).toThrow('tokens');
  });

  it('繁中：简体转台湾正体，记号不变', () => {
    expect(toTw({ title: '小镇日报', body: '{r:7} 在酒吧里发现了宝藏' })).toEqual({
      title: '小鎮日報',
      body: '{r:7} 在酒吧裡發現了寶藏',
    });
  });
});

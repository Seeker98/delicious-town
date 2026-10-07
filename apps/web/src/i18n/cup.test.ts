import { describe, expect, it } from 'vitest';
import type { NewsNames } from '../utils/news';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';

const names = {} as NewsNames;
const ALL = [
  ['zh-CN', zhCN],
  ['en', en],
  ['es', es],
  ['fr', fr],
] as const;

describe('猜酒杯的文案（问题记录 427-5 审查）', () => {
  it.each(ALL)('%s：改版前的旧新闻按连中次数写，新的按轮数写，都不出现 undefined', (_l, m) => {
    const cup = m.news.render['bar.cup']!;
    const old = cup('W', { times: 4, lucky: false }, names);
    expect(old).toContain('4');
    expect(old).not.toContain('undefined');
    const now = cup('W', { round: 3, cups: 5 }, names);
    expect(now).toContain('3');
    expect(now).toContain('5');
    expect(now).not.toContain('undefined');
  });

  it.each([
    ['en', en, /\b1 rounds\b/],
    ['es', es, /\b1 rondas\b/],
    ['fr', fr, /\b1 manches\b/],
  ] as const)('%s：区服把新闻配到第 1 档、只有 1 轮时用单数', (_l, m, plural) => {
    expect(m.news.render['bar.cup']!('W', { round: 1, cups: 2 }, names)).not.toMatch(plural);
    expect(m.news.render['bar.cup.big']!('W', { round: 1, cups: 2 }, names)).not.toMatch(plural);
    expect(m.bar.cup.rule(1, 1)).not.toMatch(plural);
  });

  it('法文的收手或继续用陈述句提问', () => {
    expect(fr.bar.cup.won('', 2, 3, 5)).toContain('Vous vous arrêtez');
  });
});

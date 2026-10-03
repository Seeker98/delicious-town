import { describe, expect, it } from 'vitest';
import type { Chapter, Quest, QuestLine, WeeklyGroup } from '@dt/config';
import {
  CHAPTER_MARK,
  convertOld,
  counterOf,
  foreignLearned,
  lineViews,
  mainView,
  reachedChapter,
  weeklyGroupFor,
  type QuestCtx,
} from './quests';

const ch = (id: number, needLevel = 1, needStar = 0): Chapter => ({
  id,
  name: `第${id}章`,
  needLevel,
  needStar,
  award: {},
});
const q = (id: number, chapter: number, key: string, target = 1, extra: Partial<Quest> = {}): Quest => ({
  id,
  line: null,
  chapter,
  order: id % 20,
  needStar: 0,
  name: `任务${id}`,
  cond: { kind: 'counter', key, target },
  award: {},
  href: '/',
  feature: key.split('.')[0]!,
  ...extra,
});
const chapters = [ch(1), ch(2, 5), ch(3, 10, 1)];
const mains = [q(2021, 1, 'a'), q(2022, 1, 'b'), q(2041, 2, 'c'), q(2061, 3, 'd')];
const ctx = (p: Partial<QuestCtx> = {}): QuestCtx => ({
  level: 1,
  star: 0,
  done: new Set(),
  progress: () => 0,
  available: () => true,
  ...p,
});

describe('主线（问题记录 318）', () => {
  it('当前章 = 第一个没领完（含章末）的章；章内任务一起列出', () => {
    const v = mainView(chapters, mains, ctx());
    expect(v.chapter?.id).toBe(1);
    expect(v.quests.map((x) => x.id)).toEqual([2021, 2022]);
    expect(v.chapterClaimable).toBe(false);
  });
  it('章内任务都领了才能领章末；章末领了才进下一章', () => {
    const done = new Set([2021, 2022]);
    expect(mainView(chapters, mains, ctx({ done, level: 5 })).chapterClaimable).toBe(true);
    done.add(CHAPTER_MARK + 1);
    expect(mainView(chapters, mains, ctx({ done, level: 5 })).chapter?.id).toBe(2);
  });
  it('解锁条件不满足：返回这一章并标锁定，不列任务（Review Focus 1）', () => {
    const v = mainView(chapters, mains, ctx({ done: new Set([2021, 2022, CHAPTER_MARK + 1]), level: 3 }));
    expect(v).toMatchObject({ locked: true, quests: [], chapterClaimable: false, allDone: false });
    expect(v.chapter?.id).toBe(2);
  });
  it('功能关掉的任务跳过，不挡章末（Review Focus 5）', () => {
    const v = mainView(chapters, mains, ctx({ done: new Set([2021]), available: (f) => f !== 'b' }));
    expect(v.quests.map((x) => x.id)).toEqual([2021]);
    expect(v.chapterClaimable).toBe(true);
  });
  it('全部做完', () => {
    const done = new Set([2021, 2022, 2041, 2061, CHAPTER_MARK + 1, CHAPTER_MARK + 2, CHAPTER_MARK + 3]);
    const v = mainView(chapters, mains, ctx({ done, level: 99, star: 9 }));
    expect(v).toMatchObject({ chapter: null, allDone: true });
    expect(reachedChapter(v, chapters)).toBe(4);
  });
});

describe('支线', () => {
  const lines: QuestLine[] = [
    { id: 1, key: 'x', name: '甲', chapter: 1, feature: 'x' },
    { id: 2, key: 'y', name: '乙', chapter: 3, feature: 'y' },
  ];
  const steps = [
    q(3021, 1, 'x.a', 1, { line: 1, order: 1 }),
    q(3022, 1, 'x.b', 1, { line: 1, order: 2, needStar: 2 }),
    q(3041, 3, 'y.a', 1, { line: 2, order: 1 }),
  ];
  it('只开启已到达章节的支线；一次显示一档；星级不够标锁定', () => {
    const v = lineViews(lines, steps, ctx({ done: new Set([3021]) }), 1);
    expect(v.map((x) => [x.line.id, x.quest?.id, x.lockedStar, x.doneCount, x.total])).toEqual([
      [1, 3022, 2, 1, 2],
    ]);
  });
  it('全部领完的支线 quest 为 null', () => {
    const v = lineViews(lines, steps, ctx({ done: new Set([3021, 3022]), star: 2 }), 1);
    expect(v[0]!.quest).toBeNull();
  });
});

describe('异国街道已学数', () => {
  it('只算 14 号街起', () => {
    expect(foreignLearned({ '1': 5, '13': 2, '14': 3, '29': 4 })).toBe(7);
    expect(foreignLearned({})).toBe(0);
  });
});

describe('计数条件', () => {
  it('| 连接的键取和', () => {
    expect(counterOf('post.create|post.reply', { 'post.create': 1, 'post.reply': 2 })).toBe(3);
    expect(counterOf('oil.fill', {})).toBe(0);
  });
});

describe('每周和老号换算', () => {
  const groups = [
    { key: 'A', minStar: 0, maxStar: 0 },
    { key: 'B', minStar: 1, maxStar: 2 },
    { key: 'C', minStar: 3, maxStar: 99 },
  ] as WeeklyGroup[];
  it('按星级分组', () => {
    expect([0, 1, 2, 3, 12].map((s) => weeklyGroupFor(groups, s)?.key)).toEqual(['A', 'B', 'B', 'C', 'C']);
  });
  it('整章已达成的章记完成（不含章末）；遇到第一个没达成的章停下（Review Focus 3）', () => {
    const progress = (c: { key: string }) => (['a', 'b', 'c'].includes(c.key) ? 1 : 0);
    expect(convertOld(chapters, mains, ctx({ level: 99, star: 9, progress }))).toEqual([2021, 2022, 2041]);
  });
  it('章没解锁时不往后换算', () => {
    const progress = () => 1;
    expect(convertOld(chapters, mains, ctx({ level: 3, progress }))).toEqual([2021, 2022]);
  });
});

import { describe, expect, it } from 'vitest';
import type { Chapter, Quest, QuestCond, QuestLine, WeeklyGroup } from '@dt/config';
import { testConfig } from '../../../test/config';
import {
  CHAPTER_MARK,
  convertOld,
  counterOf,
  foreignLearned,
  isNewContent,
  lineViews,
  mainView,
  reachedChapter,
  weeklyCounterKeys,
  weeklyGroupFor,
  type QuestCtx,
} from './quests';

const config = testConfig();

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

describe('支线逐档按功能过滤（终审 Important 4）', () => {
  const lines: QuestLine[] = [{ id: 2, key: 'town', name: '小镇', chapter: 1, feature: 'hiphop' }];
  const steps = [
    q(3041, 1, 'hiphop.reward', 1, { line: 2, order: 1, feature: 'hiphop' }),
    q(3042, 1, 'krab.shake', 1, { line: 2, order: 2, feature: 'town' }),
  ];
  it('第一档的功能关了：支线照样显示，跳到能做的档', () => {
    const v = lineViews(lines, steps, ctx({ available: (f) => f !== 'hiphop' }), 1);
    expect(v.map((x) => [x.quest?.id, x.total])).toEqual([[3042, 1]]);
  });
  it('中间档的功能关了：跳过它，不卡住', () => {
    const v = lineViews(lines, steps, ctx({ done: new Set([3041]), available: (f) => f !== 'town' }), 1);
    expect(v.map((x) => [x.quest, x.doneCount, x.total])).toEqual([[null, 1, 1]]);
  });
  it('所有档的功能都关了：支线不显示', () => {
    expect(lineViews(lines, steps, ctx({ available: () => false }), 1)).toEqual([]);
  });
});

describe('换算：318 才有的内容按已达成算（终审 Important 1）', () => {
  it('新动作键、异国街道的任务没有历史计数，不挡老号换算', () => {
    const b = config.bundle;
    const progress = (c: QuestCond) => (c.kind === 'state' ? 1_000_000 : isNewContent(c) ? 0 : 1_000_000);
    const base = ctx({ level: 120, star: 12, progress });
    const old = convertOld(b.chapters, b.quests, base);
    expect(Math.max(...old.map((id) => b.quests.find((x) => x.id === id)!.chapter))).toBe(5);
    const all = convertOld(b.chapters, b.quests, base, isNewContent);
    expect(all).toHaveLength(b.quests.filter((x) => x.line === null).length);
    expect(isNewContent({ kind: 'counter', key: 'post.create|post.reply', target: 1 })).toBe(true);
    expect(isNewContent({ kind: 'state', key: 'cookbooks.foreignLearned', target: 10 })).toBe(true);
    expect(isNewContent({ kind: 'counter', key: 'oil.fill', target: 1 })).toBe(false);
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

describe('章末领过后功能又打开（backlog 318）', () => {
  // 第 1 章领章末时 b 功能关着：2022 没列出、没领；现在 b 又打开了
  const reopened = (extra: number[] = [], p: Partial<QuestCtx> = {}) =>
    mainView(chapters, mains, ctx({ done: new Set([2021, CHAPTER_MARK + 1, ...extra]), level: 5, ...p }));
  it('当前章不退回第 1 章，补出来的任务单独列出', () => {
    const v = reopened();
    expect(v.chapter?.id).toBe(2);
    expect(v.quests.map((x) => x.id)).toEqual([2041]);
    expect(v.leftover.map((x) => x.id)).toEqual([2022]);
  });
  it('补出来的任务不挡当前章的章末', () => {
    expect(reopened([2041]).chapterClaimable).toBe(true);
  });
  it('补出来的任务领了就不再列出；功能还关着时也不列', () => {
    expect(reopened([2022]).leftover).toEqual([]);
    expect(reopened([], { available: (f) => f !== 'b' }).leftover).toEqual([]);
  });
  it('主线全部做完时补出来的任务照样列出', () => {
    const v = reopened([2041, 2061, CHAPTER_MARK + 2, CHAPTER_MARK + 3], { level: 99, star: 9 });
    expect(v).toMatchObject({ chapter: null, allDone: true });
    expect(v.leftover.map((x) => x.id)).toEqual([2022]);
  });
});

describe('每周计数的键（backlog 318）', () => {
  it('| 连接的键拆开记，和进度用的 counterOf 对得上', () => {
    const groups = [
      { quests: [{ key: 'market.buy' }, { key: 'post.create|post.reply' }] },
      { quests: [{ key: 'market.buy' }] },
    ] as unknown as WeeklyGroup[];
    expect([...weeklyCounterKeys(groups)].sort()).toEqual(['market.buy', 'post.create', 'post.reply']);
  });
});

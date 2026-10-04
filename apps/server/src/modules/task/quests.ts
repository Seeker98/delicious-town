import type { Chapter, Quest, QuestCond, QuestLine, WeeklyGroup } from '@dt/config';

/** 章末奖励的完成标记（问题记录 318）：quest_done 里记 100000 + 章 id */
export const CHAPTER_MARK = 100000;

export interface QuestCtx {
  level: number;
  star: number;
  done: ReadonlySet<number>;
  progress: (c: QuestCond) => number;
  available: (feature: string) => boolean;
}

export interface MainView {
  chapter: Chapter | null;
  locked: boolean;
  quests: Quest[];
  chapterClaimable: boolean;
  allDone: boolean;
  /** 章末已经领过的章里补出来的任务（领章末时功能关着、后来又打开）：照常可领，不挡当前章（backlog 318） */
  leftover: Quest[];
}

const sorted = (chapters: readonly Chapter[]) => [...chapters].sort((a, b) => a.id - b.id);
const chapterQuests = (quests: readonly Quest[], id: number, c: QuestCtx) =>
  quests
    .filter((q) => q.line === null && q.chapter === id && c.available(q.feature))
    .sort((a, b) => a.order - b.order);
const unlocked = (ch: Chapter, c: QuestCtx) => c.level >= ch.needLevel && c.star >= ch.needStar;

/**
 * 当前章：第一个章末没领的章；解锁条件不够时返回这一章并标锁定。
 * 章末领过的章不再回到当前章：之后功能打开补出来的任务放进 leftover，不让当前章倒退（backlog 318）
 */
export function mainView(chapters: readonly Chapter[], quests: readonly Quest[], c: QuestCtx): MainView {
  const leftover: Quest[] = [];
  for (const ch of sorted(chapters)) {
    const list = chapterQuests(quests, ch.id, c);
    if (c.done.has(CHAPTER_MARK + ch.id)) {
      leftover.push(...list.filter((q) => !c.done.has(q.id)));
      continue;
    }
    if (!unlocked(ch, c))
      return { chapter: ch, locked: true, quests: [], chapterClaimable: false, allDone: false, leftover };
    const allClaimed = list.every((q) => c.done.has(q.id));
    return {
      chapter: ch,
      locked: false,
      quests: list,
      chapterClaimable: allClaimed,
      allDone: false,
      leftover,
    };
  }
  return { chapter: null, locked: false, quests: [], chapterClaimable: false, allDone: true, leftover };
}

/** 已到达的章：当前章（锁定时算上一章）；全部做完 = 最后一章 + 1 */
export function reachedChapter(v: MainView, chapters: readonly Chapter[]): number {
  if (v.allDone) return Math.max(0, ...chapters.map((c) => c.id)) + 1;
  if (!v.chapter) return 0;
  return v.locked ? v.chapter.id - 1 : v.chapter.id;
}

/**
 * 已开启的支线各显示当前一档；星级不够时标出要几星。
 * 档位逐个按功能过滤（一条支线可能混着几个功能，如小镇：嘻哈男孩、蟹老板、菜场）：关掉的档跳过，
 * 一档都做不了的支线不显示
 */
export function lineViews(
  lines: readonly QuestLine[],
  quests: readonly Quest[],
  c: QuestCtx,
  reached: number,
) {
  return lines
    .filter((l) => l.chapter <= reached)
    .map((line) => {
      const steps = quests
        .filter((q) => q.line === line.id && c.available(q.feature))
        .sort((a, b) => a.order - b.order);
      const next = steps.find((q) => !c.done.has(q.id)) ?? null;
      return {
        line,
        quest: next,
        lockedStar: next && c.star < next.needStar ? next.needStar : null,
        doneCount: steps.filter((q) => c.done.has(q.id)).length,
        total: steps.length,
      };
    })
    .filter((v) => v.total > 0);
}

/** 每周计数要记的动作键：| 连接的键拆开记，进度用 counterOf 取和（backlog 318） */
export function weeklyCounterKeys(groups: readonly WeeklyGroup[]): Set<string> {
  return new Set(groups.flatMap((g) => g.quests.flatMap((q) => q.key.split('|'))));
}

export function weeklyGroupFor(groups: readonly WeeklyGroup[], star: number): WeeklyGroup | null {
  return groups.find((g) => star >= g.minStar && star <= g.maxStar) ?? null;
}

/** 计数条件的进度：键可以用 | 连接多个（"论坛发帖或回复"），取和 */
export function counterOf(key: string, counters: Readonly<Record<string, number>>): number {
  return key.split('|').reduce((s, k) => s + (counters[k] ?? 0), 0);
}

/**
 * 老号换算（问题记录 318，设计 §9）：从第 1 章往后，整章任务都已达成的章，任务记完成（不发奖励，章末留着可领）；
 * 遇到第一个有任务没达成、或没解锁的章停下。assumed 为真的条件按已达成算（318 才有的内容，见 isNewContent）
 */
export function convertOld(
  chapters: readonly Chapter[],
  quests: readonly Quest[],
  c: QuestCtx,
  assumed: (cond: QuestCond) => boolean = () => false,
): number[] {
  const out: number[] = [];
  for (const ch of sorted(chapters)) {
    if (!unlocked(ch, c)) break;
    const list = chapterQuests(quests, ch.id, c);
    if (!list.every((q) => assumed(q.cond) || c.progress(q.cond) >= q.cond.target)) break;
    out.push(...list.map((q) => q.id));
  }
  return out;
}

/** 异国街道从 14 号街起 */
export const FOREIGN_STREET_FROM = 14;
/** 异国街道已学食谱数之和（问题记录 318："在异国街道学会 N 道菜"） */
export function foreignLearned(street: Readonly<Record<string, number>>): number {
  return Object.entries(street)
    .filter(([s]) => Number(s) >= FOREIGN_STREET_FROM)
    .reduce((s, [, n]) => s + n, 0);
}

/**
 * 问题记录 318 才有的内容：这些动作以前不发事件、异国街道刚上线，老号没有历史计数。
 * 换算时按已达成算，免得老号都停在第 6 章、把后面各章的任务奖励再领一遍（终审 Important 1）
 */
const NEW_CONTENT_KEYS: ReadonlySet<string> = new Set([
  'exchange.fill',
  'predict.trade',
  'predict.win',
  'kuji.draw',
  'kuji.last',
  'activity.claim',
  'rest.move',
  'post.reply',
  'cookbooks.foreignLearned',
]);
export const isNewContent = (c: QuestCond): boolean => c.key.split('|').some((k) => NEW_CONTENT_KEYS.has(k));

import { GOODS, type Tuning } from '@dt/config';
import { gameDay, type MemoryAnswerDto, type MemoryRoundDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { randomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods } from '../store/goods';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { memoryWindow } from './rules';

/** 服务端局面 */
export interface MemoryState {
  level: number;
  seq: number[];
  /** 发出配方的时刻（毫秒） */
  shownAt: number;
  /** 本关已答对，等玩家选继续或收手 */
  passed: boolean;
}

function newSeq(o: Op, level: number): number[] {
  const m = o.tuning.bar.memory;
  return Array.from({ length: m.lengths[level - 1]! }, () => o.rng.int(m.ingredients));
}

function roundDto(o: Op, s: MemoryState): MemoryRoundDto {
  const m = o.tuning.bar.memory;
  const w = memoryWindow(s.seq.length, m);
  return { level: s.level, seq: s.seq, flashMs: m.flashMs, gapMs: m.gapMs, answerMs: w.latest - w.showMs };
}

/** 开局（设计文档 §2.2）：每局扣 cost，每天最多 dailyMax 局 */
export async function memoryStart(o: Op): Promise<MemoryRoundDto> {
  const m = o.tuning.bar.memory;
  await assertNoRound(o, 'memory');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.memory', day)) >= m.dailyMax)
    throw limitReached('bar_daily', { max: m.dailyMax });
  await consumeGoods(o, GOODS.mysteryTicket, m.cost);
  await incrementDaily(o.tx, o.rest.id, 'bar.memory', 1, day);
  const s: MemoryState = { level: 1, seq: [], shownAt: o.now.getTime(), passed: false };
  s.seq = newSeq(o, 1);
  await saveRound(o, 'memory', s);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.memory');
  return roundDto(o, s);
}

/** 作答：时间窗外或顺序不对都算答错，本局结束；答对当场发本关奖励 */
export async function memoryAnswer(o: Op, answer: number[]): Promise<MemoryAnswerDto> {
  const m = o.tuning.bar.memory;
  const s = await loadRound<MemoryState>(o, 'memory');
  if (!s || s.passed) throw invalidState('no_round');
  const w = memoryWindow(s.seq.length, m);
  const elapsed = o.now.getTime() - s.shownAt;
  const inTime = elapsed >= w.earliest && elapsed <= w.latest;
  const right = answer.length === s.seq.length && answer.every((x, i) => x === s.seq[i]);
  if (!inTime || !right) {
    await endRound(o, 'memory');
    const reason = elapsed < w.earliest ? 'early' : elapsed > w.latest ? 'late' : 'wrong';
    restLog(o, 'bar.memory', { level: s.level, correct: false, reason });
    return { correct: false, reason, level: s.level, award: null, canNext: false, finished: true };
  }
  const award = await randomAward(o, { level: m.awardLevels[s.level - 1]!, noTicket: true, bar: true });
  const last = s.level >= m.lengths.length;
  if (last) {
    await endRound(o, 'memory');
    const perfect = await incrementDaily(o.tx, o.rest.id, 'bar.memory.perfect', 1, gameDay(o.now));
    // 每家店每天只写一条新闻（终审 I4：脚本刷屏）
    if (perfect === 1) opNews(o, 'bar.memory', { level: s.level });
  } else {
    await saveRound(o, 'memory', { ...s, passed: true });
  }
  restLog(o, 'bar.memory', { level: s.level, correct: true });
  return { correct: true, reason: null, level: s.level, award, canNext: !last, finished: last };
}

/** 继续下一关：不再扣费，生成更长的配方 */
export async function memoryNext(o: Op): Promise<MemoryRoundDto> {
  const s = await loadRound<MemoryState>(o, 'memory');
  if (!s) throw invalidState('no_round');
  if (!s.passed) throw invalidState('not_passed');
  const level = s.level + 1;
  const next: MemoryState = { level, seq: newSeq(o, level), shownAt: o.now.getTime(), passed: false };
  await saveRound(o, 'memory', next);
  return roundDto(o, next);
}

/** 概览用：本关没答对时给出配方和剩余作答毫秒（配方之前已经发给过前端，再给一次没有新的作弊空间） */
export function memoryResume(
  s: MemoryState,
  m: Tuning['bar']['memory'],
  now: Date,
): { level: number; passed: boolean; seq: number[] | null; leftMs: number | null } {
  if (s.passed) return { level: s.level, passed: true, seq: null, leftMs: null };
  const w = memoryWindow(s.seq.length, m);
  return {
    level: s.level,
    passed: false,
    seq: s.seq,
    leftMs: Math.max(0, w.latest - (now.getTime() - s.shownAt)),
  };
}

/** 收手：结束本局，已发的奖励不变 */
export async function memoryStop(o: Op): Promise<Record<string, never>> {
  await endRound(o, 'memory');
  return {};
}

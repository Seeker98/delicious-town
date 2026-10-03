import { describe, expect, it } from 'vitest';
import {
  addDays,
  weekStart,
  gameDay,
  gameParts,
  gameTime,
  latestSlot,
  nextSlot,
  parseSlotKey,
  roundOf,
  slotKey,
} from './time';

describe('北京时间', () => {
  it('gameParts 与 gameDay 一致，UTC 16:00 是北京时间次日 0 点', () => {
    expect(gameParts(new Date('2026-09-29T15:59:59Z'))).toEqual({ day: '2026-09-29', hour: 23, minute: 59 });
    expect(gameParts(new Date('2026-09-29T16:00:00Z'))).toEqual({ day: '2026-09-30', hour: 0, minute: 0 });
    expect(gameDay(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
  });
  it('addDays 与 gameTime', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(gameTime('2026-09-30', 8).toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(slotKey('2026-09-30', 8)).toBe('2026-09-30@08');
  });
});

describe('时间槽', () => {
  const hours = [8, 10, 12, 14, 16, 18, 20];
  it('latestSlot：取最近一个已到达的时点；清晨取前一天最后一个', () => {
    expect(latestSlot(gameTime('2026-09-30', 10), hours).key).toBe('2026-09-30@10');
    expect(latestSlot(gameTime('2026-09-30', 11, 59), hours).key).toBe('2026-09-30@10');
    expect(latestSlot(gameTime('2026-09-30', 7, 59), hours).key).toBe('2026-09-29@20');
    expect(latestSlot(gameTime('2026-09-30', 10), hours).start).toEqual(gameTime('2026-09-30', 10));
  });
  it('nextSlot：严格晚于当前小时；刚好整点时取下一个', () => {
    expect(nextSlot(gameTime('2026-09-30', 10), hours).key).toBe('2026-09-30@12');
    expect(nextSlot(gameTime('2026-09-30', 9, 59), hours).key).toBe('2026-09-30@10');
    expect(nextSlot(gameTime('2026-09-30', 20, 30), hours).key).toBe('2026-10-01@08');
  });
  it('parseSlotKey 是 slotKey 的逆运算', () => {
    expect(parseSlotKey('2026-09-30@08')).toEqual(latestSlot(gameTime('2026-09-30', 8), hours));
    expect(() => parseSlotKey('bad')).toThrow();
  });
  it('roundOf：每 4 分钟一轮', () => {
    expect(roundOf(new Date(240_000 * 10))).toBe(10);
    expect(roundOf(new Date(240_000 * 10 + 239_999))).toBe(10);
  });
});

describe('weekStart（问题记录 318：每周任务周一 0 点刷新）', () => {
  it('返回这一天所在周的周一', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // 周日
    expect(weekStart('2026-10-05')).toBe('2026-10-05'); // 周一
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // 跨年
  });
});

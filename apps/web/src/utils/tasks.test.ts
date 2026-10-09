import { describe, expect, it } from 'vitest';
import type { QuestDto, QuestsDto } from '@dt/shared';
import { claimableTabs, firstClaimableTab } from './tasks';

const q = (patch: Partial<QuestDto> = {}): QuestDto => ({
  id: 1,
  name: 'x',
  href: '/',
  key: 'k',
  target: 1,
  progress: 0,
  done: false,
  claimed: false,
  award: {},
  ...patch,
});
const ready = { progress: 1, done: true };
const base: QuestsDto = {
  chapter: {
    id: 1,
    name: 'c',
    needLevel: 1,
    needStar: 0,
    locked: false,
    award: {},
    claimable: false,
    total: 1,
    claimedCount: 0,
    doneCount: 0,
  },
  main: [q()],
  leftover: [],
  allMainDone: false,
  lines: [],
  weekly: null,
};
const weekly = (patch: { quest?: Partial<QuestDto>; full?: boolean } = {}): QuestsDto['weekly'] => ({
  group: 'g',
  week: '2026-10-05',
  endsAt: '2026-10-12T00:00:00+08:00',
  quests: [q(patch.quest)],
  full: { id: 9, award: {}, claimable: patch.full ?? false, claimed: false },
});
const line = (quest: QuestDto | null, lockedStar: number | null = null) => ({
  id: 1,
  name: 'l',
  quest,
  lockedStar,
  doneCount: 0,
  total: 3,
});

describe('任务各卡有没有能领的（任务页卡上的礼物图标、首页任务入口，问题记录 555）', () => {
  it('都没有', () => {
    expect(claimableTabs(base)).toEqual({ main: false, weekly: false, side: false });
    expect(firstClaimableTab(base)).toBeNull();
    expect(firstClaimableTab(null)).toBeNull();
  });

  it('主线：本章任务、补领的任务、章末奖励', () => {
    expect(claimableTabs({ ...base, main: [q(ready)] }).main).toBe(true);
    expect(claimableTabs({ ...base, main: [q({ ...ready, claimed: true })] }).main).toBe(false);
    expect(claimableTabs({ ...base, leftover: [q(ready)] }).main).toBe(true);
    expect(claimableTabs({ ...base, chapter: { ...base.chapter!, claimable: true } }).main).toBe(true);
  });

  it('每周：任务或全勤奖励', () => {
    expect(claimableTabs({ ...base, weekly: weekly({ quest: ready }) }).weekly).toBe(true);
    expect(claimableTabs({ ...base, weekly: weekly({ full: true }) }).weekly).toBe(true);
    expect(claimableTabs({ ...base, weekly: weekly() }).weekly).toBe(false);
  });

  it('支线：星级没到的那一档不算', () => {
    expect(claimableTabs({ ...base, lines: [line(q(ready))] }).side).toBe(true);
    expect(claimableTabs({ ...base, lines: [line(q(ready), 3)] }).side).toBe(false);
    expect(claimableTabs({ ...base, lines: [line(null)] }).side).toBe(false);
  });

  it('第一个能领的卡：主线 → 每周 → 支线', () => {
    const all = { ...base, main: [q(ready)], weekly: weekly({ full: true }), lines: [line(q(ready))] };
    expect(firstClaimableTab(all)).toBe('main');
    expect(firstClaimableTab({ ...all, main: [q()] })).toBe('weekly');
    expect(firstClaimableTab({ ...all, main: [q()], weekly: weekly() })).toBe('side');
  });
});

import type { BarDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import type { MascotLine } from './mascot';

/** 雯姐在酒吧的闲聊（问题记录 210）：只写游戏里真有的规则；文案按语言（问题记录 272） */
export const wenjieChat = (): readonly string[] => activeMessages().bar.wenjie.chat;

/** 当前能说的台词：看酒吧状态说的权重 2，闲聊权重 1；还没读到数据时只有闲聊 */
export function wenjieLines(data: BarDto | null): MascotLine[] {
  const w = activeMessages().bar.wenjie;
  const out: MascotLine[] = [];
  if (data) {
    const say = (text: string) => out.push({ text, weight: 2 });
    const mem = data.memory.max - data.memory.played;
    if (mem > 0) say(w.memoryLeft(mem));
    const darts = data.darts.max - data.darts.played;
    if (darts > 0) say(w.dartsLeft(darts));
    if (data.tickets === 0) say(w.noTickets);
    if (data.slot.floorLeft <= 5) say(w.slotFloor(data.slot.floorLeft));
    if (data.devil.round && data.devil.round.result === null) say(w.devilOpen);
  }
  for (const text of w.chat) out.push({ text, weight: 1 });
  return out;
}

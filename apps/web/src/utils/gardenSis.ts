import type { MarketDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { timeHM } from './format';
import type { MascotLine } from './mascot';

export { pickLine } from './mascot';

/** 菜园姐的闲聊（问题记录 176，设计 §5.2）：和菜场状态无关；文案按语言（问题记录 272） */
export const chatLines = (): readonly string[] => activeMessages().market.sis.chat;

/** 当前能说的台词：看菜场状态说的权重 2，闲聊权重 1；还没读到菜场数据时只有闲聊 */
export function gardenLines(data: MarketDto | null): MascotLine[] {
  const sis = activeMessages().market.sis;
  const out: MascotLine[] = [];
  if (data) {
    const say = (text: string) => out.push({ text, weight: 2 });
    if (data.special.length > 0) say(sis.specialLeft(data.special.length));
    else say(sis.specialSoldOut(timeHM(data.nextSpecial)));
    say(sis.nextDaily(timeHM(data.nextDaily)));
    if (data.guess.joined === null) say(sis.guessOpen);
    if (data.manual.hasCard) say(sis.hasCard);
    if (data.cupboardFull) say(sis.cupboardFull);
  }
  for (const text of sis.chat) out.push({ text, weight: 1 });
  return out;
}

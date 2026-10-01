import type { z } from 'zod';
import { REDEEM_CODE_RE, rewardItems, type RewardItems } from '@dt/shared';
import type { newbieCodesFile } from './raw';

export interface NewbieCode {
  code: string;
  minLevel: number;
  items: RewardItems;
  note: string;
}

/** 新手码（问题记录 150，设计 §4.1）：码格式、不重复、奖励能通过附件校验、引用的道具食材存在 */
export function checkNewbieCodes(
  file: z.infer<typeof newbieCodesFile>,
  goodsIds: ReadonlySet<number>,
  foodIds: ReadonlySet<number>,
  errors: string[],
): NewbieCode[] {
  const seen = new Set<string>();
  const out: NewbieCode[] = [];
  for (const c of file.codes) {
    const err = (m: string) => errors.push(`newbie_codes ${c.code}: ${m}`);
    if (!REDEEM_CODE_RE.test(c.code)) err('bad code');
    if (seen.has(c.code)) err('duplicate');
    seen.add(c.code);
    const items = rewardItems.safeParse(c.items);
    if (!items.success) {
      err('bad items');
      continue;
    }
    for (const g of items.data.goods ?? []) if (!goodsIds.has(g.id)) err(`unknown goods ${g.id}`);
    for (const f of items.data.foods ?? []) if (!foodIds.has(f.id)) err(`unknown foods ${f.id}`);
    out.push({ code: c.code, minLevel: c.minLevel, items: items.data, note: c.note });
  }
  return out;
}

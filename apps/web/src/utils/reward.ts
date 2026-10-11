import { HAT_PREFIX, type AwardDto, type RewardItems } from '@dt/shared';
import { activeMessages } from '../i18n';
import type { ArtName } from '../art/generated/names';
import { formatNum, gameDateTime } from './format';

/** 一个称号附件的文字：过期、领取后几天、到哪天（邮箱附件摘要和小胶囊共用） */
function iconText(c: NonNullable<RewardItems['icons']>[number], title: string): string {
  const r = activeMessages().util.reward;
  if (c.expired) return r.iconExpired(title);
  if (c.days !== undefined) return r.icon(title) + r.iconDays(c.days);
  if (c.until !== undefined)
    return (
      r.icon(title) +
      r.iconUntil(
        gameDateTime(c.until, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }),
      )
    );
  return r.icon(title);
}

/**
 * 附件摘要："银币 100、钻石 2、神秘礼券×3、玉•大橘之帽、称号「面霸」 (领取后 7 天)"（邮箱、后台共用）。
 * 称号（问题记录 539）：配置称号用当前语言的名字，定制称号用附件里的名字快照
 */
export function rewardSummary(
  i: RewardItems,
  names: {
    goodsName(id: number): string;
    foodName(id: number): string;
    icon?(key: string): { title: string } | undefined;
  },
): string {
  const r = activeMessages().util.reward;
  const parts: string[] = [];
  if (i.coin) parts.push(r.coin(formatNum(i.coin)));
  if (i.diamond) parts.push(r.diamond(formatNum(i.diamond)));
  if (i.exp) parts.push(r.exp(formatNum(i.exp)));
  const q = activeMessages().common.qty;
  for (const g of i.goods ?? []) parts.push(q(names.goodsName(g.id), g.num));
  for (const f of i.foods ?? []) parts.push(q(names.foodName(f.id), f.num));
  for (const h of i.hats ?? []) parts.push(r.hat(HAT_PREFIX[h.tier], h.name));
  for (const c of i.icons ?? []) parts.push(iconText(c, names.icon?.(c.key)?.title ?? c.title));
  return parts.join(activeMessages().events.sep);
}

/**
 * 附件拆成小胶囊（界面改版 P10：邮箱）：每样一枚，图 + 名字×数量；称号没有图（art 为 null），
 * 文字和 rewardSummary 的每一段一样
 */
export function rewardChips(
  i: RewardItems,
  names: {
    goodsName(id: number): string;
    foodName(id: number): string;
    goodsArt(id: number): ArtName;
    foodArt(id: number): ArtName;
    icon?(key: string): { title: string } | undefined;
  },
): Array<{ art: ArtName | null; text: string }> {
  const r = activeMessages().util.reward;
  const q = activeMessages().common.qty;
  const out: Array<{ art: ArtName | null; text: string }> = [];
  if (i.coin) out.push({ art: 'res-coin-silver', text: r.coin(formatNum(i.coin)) });
  if (i.diamond) out.push({ art: 'res-diamond', text: r.diamond(formatNum(i.diamond)) });
  if (i.exp) out.push({ art: 'res-exp', text: r.exp(formatNum(i.exp)) });
  for (const g of i.goods ?? [])
    out.push({ art: names.goodsArt(g.id), text: q(names.goodsName(g.id), g.num) });
  for (const f of i.foods ?? []) out.push({ art: names.foodArt(f.id), text: q(names.foodName(f.id), f.num) });
  for (const h of i.hats ?? []) out.push({ art: 'slot-hat', text: r.hat(HAT_PREFIX[h.tier], h.name) });
  // 称号的写法和 rewardSummary 一样：过期、领取后几天、到哪天
  for (const c of i.icons ?? []) {
    const title = names.icon?.(c.key)?.title ?? c.title;
    out.push({ art: null, text: iconText(c, title) });
  }
  return out;
}

/** 任务、活跃奖励的文字："银币 100, 经验 500, 神秘礼券 ×3"（任务页、活跃按钮共用） */
export function awardText(
  a: AwardDto,
  names: { goodsName(id: number): string; foodName(id: number): string },
): string {
  const m = activeMessages();
  const r = m.util.reward;
  const parts: string[] = [];
  if (a.coin) parts.push(r.coin(formatNum(a.coin)));
  if (a.exp) parts.push(r.exp(formatNum(a.exp)));
  if (a.diamond) parts.push(r.diamond(formatNum(a.diamond)));
  if (a.renown) parts.push(r.renown(formatNum(a.renown)));
  for (const g of a.goods ?? []) parts.push(m.common.qty(names.goodsName(g.id), g.num));
  for (const f of a.foods ?? []) parts.push(m.common.qty(names.foodName(f.id), f.num));
  return parts.join(m.events.sep);
}

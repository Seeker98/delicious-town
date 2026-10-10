import { HAT_PREFIX, type AwardDto, type RewardItems } from '@dt/shared';
import { activeMessages } from '../i18n';
import { formatNum, gameDateTime } from './format';

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
  for (const c of i.icons ?? []) {
    const title = names.icon?.(c.key)?.title ?? c.title;
    if (c.expired) parts.push(r.iconExpired(title));
    else if (c.days !== undefined) parts.push(r.icon(title) + r.iconDays(c.days));
    else if (c.until !== undefined)
      parts.push(
        r.icon(title) +
          r.iconUntil(
            gameDateTime(c.until, {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }),
          ),
      );
    else parts.push(r.icon(title));
  }
  return parts.join(activeMessages().events.sep);
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

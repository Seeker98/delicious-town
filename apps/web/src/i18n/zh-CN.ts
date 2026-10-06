import { ApiError } from '../api/client';
import { activeMessages } from '.';

/**
 * 报错文案（问题记录 272 起按语言）：服务端只传错误码和参数，文案在 locales/<语言>/errors.ts。
 * 文件名沿用 zh-CN.ts，全站都从这里导入 errorText / errorMessage
 */
export interface NameResolver {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName(id: number): string;
  seedName(id: number): string;
}
const fallbackNames: NameResolver = {
  goodsName: (id) => activeMessages().errors.fallbackName.goods(id),
  foodName: (id) => activeMessages().errors.fallbackName.food(id),
  mcName: (id) => activeMessages().errors.fallbackName.mc(id),
  seedName: (id) => activeMessages().errors.fallbackName.seed(id),
};
let names: NameResolver = fallbackNames;
/** 由目录 store 在加载后注入，错误文案里才能显示道具、食材名称 */
export function setNameResolver(r: NameResolver): void {
  names = r;
}

export function errorText(code: string, params: Record<string, unknown> = {}): string {
  const e = activeMessages().errors;
  const sp = e.special;
  const str = (x: unknown) => String(x);
  const reason = typeof params.reason === 'string' ? params.reason : '';
  const what = typeof params.what === 'string' ? params.what : '';
  if (code === 'ACCOUNT_BANNED' && reason) return sp.banned(reason);
  if (code === 'RESTAURANT_NAME_INVALID' && Object.hasOwn(e.nameReason, reason))
    return e.nameReason[reason as keyof typeof e.nameReason];
  if (code === 'ALREADY_DONE' && Object.hasOwn(e.already, what))
    return e.already[what as keyof typeof e.already];
  if (code === 'EMAIL_NOT_VERIFIED' && params.who === 'target') return sp.targetNotVerified;
  if (code === 'COOLDOWN' && what === 'flip') return sp.flipCooldown;
  if (code === 'COOLDOWN' && what === 'forum_post') return sp.forumPostCooldown(Number(params.seconds));
  if (code === 'COOLDOWN' && what === 'forum_reply') return sp.forumReplyCooldown(Number(params.seconds));
  if (code === 'COOLDOWN' && what === 'broadcast') return sp.broadcastCooldown(Number(params.seconds));
  if (code === 'COOLDOWN' && what === 'weather_gap') return sp.weatherGap(Number(params.seconds));
  if (code === 'COOLDOWN' && what === 'hammer')
    return sp.hammer(Math.ceil(Number(params.seconds ?? 60) / 60));
  if (code === 'COOLDOWN' && what === 'market_special')
    return sp.marketSpecial(Number(params.minutes ?? 10), Math.ceil(Number(params.seconds ?? 60) / 60));
  if (code === 'NOT_ENOUGH') {
    const kind = str(params.kind ?? '');
    const id = Number(params.id);
    const thing =
      kind === 'goods'
        ? names.goodsName(id)
        : kind === 'foods'
          ? names.foodName(id)
          : kind === 'remnant'
            ? sp.remnant(names.mcName(id))
            : kind === 'seed'
              ? names.seedName(id)
              : kind === 'basket'
                ? sp.basket(names.foodName(id))
                : kind === 'fragment'
                  ? sp.fragment(params.part === 'main' ? 'main' : 'sub')
                  : Object.hasOwn(e.kind, kind)
                    ? e.kind[kind as keyof typeof e.kind]
                    : sp.amount;
    return sp.notEnough(thing, str(params.need), str(params.have));
  }
  if (code === 'REQUIREMENT_NOT_MET' && Object.hasOwn(e.requirement, reason))
    return e.requirement[reason as keyof typeof e.requirement](params, names);
  if (code === 'LIMIT_REACHED' && Object.hasOwn(e.limit, what))
    return e.limit[what as keyof typeof e.limit](params, names);
  // 收购的原因名和别的玩法重名（not_owned、npc 等）：带 scope 的先查收购自己的表（收购 PR 3）
  if (code === 'INVALID_STATE' && params.scope === 'acquire' && Object.hasOwn(e.acquire, reason))
    return e.acquire[reason as keyof typeof e.acquire](params, names);
  if (code === 'INVALID_STATE' && reason === 'exchange_frozen' && typeof params.why === 'string')
    return sp.exchangeFrozen(params.why);
  // 论坛长度：用服务端给的上限，改 tuning 后提示也跟着变（PR31 遗留）
  if (code === 'INVALID_STATE' && reason === 'price_band' && params.min !== undefined)
    return sp.priceBand(str(params.min), str(params.max));
  if (code === 'INVALID_STATE' && reason === 'post_text' && params.max !== undefined)
    return sp.postText(params.field === 'title' ? 'title' : 'body', str(params.max));
  if (code === 'INVALID_STATE' && reason === 'reply_text' && params.max !== undefined)
    return sp.replyText(str(params.max));
  if (code === 'INVALID_STATE' && reason === 'mail_level' && params.level !== undefined)
    return sp.mailLevel(str(params.level));
  if (code === 'INVALID_STATE' && reason === 'code_level' && params.level !== undefined)
    return sp.codeLevel(str(params.level));
  if (code === 'INVALID_STATE' && reason === 'query_text' && params.max !== undefined)
    return sp.queryText(str(params.max));
  // 嘻哈男孩出来的钟点按区服设置（问题记录 333）
  if (code === 'INVALID_STATE' && reason === 'hiphop_not_out' && params.hour !== undefined)
    return sp.hiphopNotOut(str(params.hour));
  if (code === 'INVALID_STATE' && Object.hasOwn(e.state, reason))
    return e.state[reason as keyof typeof e.state];
  return Object.hasOwn(e.code, code) ? e.code[code as keyof typeof e.code] : sp.unknown(code);
}

/** 收购不能这样做的原因（对方餐厅页、身价榜点“收购”时用；和服务端报错同一张表） */
export const acquireReason = (reason: string): string =>
  errorText('INVALID_STATE', { reason, scope: 'acquire' });

/** 把任意异常转成给玩家看的文案 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? errorText(e.code, e.params) : fallback;
}

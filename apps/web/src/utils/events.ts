import type { GameEvent, MailTpl, RestLogDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { formatNum } from './format';
import { mailTitle } from './serverText';

export interface Names {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName?(id: number): string;
  seedName?(id: number): string;
}

/** 合并同类型、同物品、同幸运标记的事件（一次得到很多东西时不刷屏），保持首次出现的顺序 */
export function mergeEvents(events: GameEvent[]): GameEvent[] {
  const out = new Map<string, GameEvent>();
  for (const e of events) {
    const key = `${e.type}:${e.kind}:${e.id ?? ''}:${e.name ?? ''}:${e.lucky ? 1 : 0}`;
    const cur = out.get(key);
    if (cur) cur.num += e.num;
    else out.set(key, { ...e });
  }
  return [...out.values()];
}

export function eventText(e: GameEvent, names: Names): string {
  const m = activeMessages().events;
  return `${e.type === 'gain' ? m.gain : m.loss} ${eventItem(e, names)}`;
}

/** 一次操作的所有得失合成一条提示（问题记录：弹出的消息框太多）；超过 max 项时只列前 max 项 */
export function eventsSummary(events: GameEvent[], names: Names, max = 8): string {
  const merged = mergeEvents(events);
  const items = [...merged.filter((e) => e.type === 'gain'), ...merged.filter((e) => e.type !== 'gain')];
  const shown = items.slice(0, max);
  const m = activeMessages().events;
  const part = (type: 'gain' | 'loss') => {
    const xs = shown.filter((e) => (e.type === 'gain') === (type === 'gain')).map((e) => eventItem(e, names));
    return xs.length === 0 ? '' : `${type === 'gain' ? m.gain : m.loss} ${xs.join(m.sep)}`;
  };
  const text = [part('gain'), part('loss')].filter(Boolean).join(m.groupSep);
  return items.length > max ? m.more(text, items.length) : text;
}

/** 一条得失的物品和数量（不含"获得 / 消耗"） */
function eventItem(e: GameEvent, names: Names): string {
  const m = activeMessages().events;
  let what: string;
  if (e.kind === 'goods') what = `${names.goodsName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'foods') what = `${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'remnant') what = `${m.remnant(names, e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'seed') what = `${m.seed(names, e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'basket') what = `${m.basket(names.foodName(e.id ?? 0))}×${formatNum(e.num)}`;
  else if (e.kind === 'activityCurrency') what = m.activityCurrency(e.name, formatNum(e.num));
  else what = `${kindName(e.kind)} ${formatNum(e.num)}`;
  return `${what}${e.lucky ? m.lucky : ''}`;
}

function kindName(kind: string): string {
  const k = activeMessages().events.kind;
  return Object.hasOwn(k, kind) ? k[kind as keyof typeof k] : kind;
}

/** 个人日志；好友对我做的操作（好友动态类型）用动态的文案，没有文案时显示类型名 */
export function logText(l: RestLogDto, names: Names): string {
  const m = activeMessages().events;
  const f = Object.hasOwn(m.logs, l.type) ? m.logs[l.type as keyof typeof m.logs] : undefined;
  // 系统邮件的标题按模板和当前语言（问题记录 272）
  const params =
    l.type === 'mail.claim' && l.params.tpl
      ? {
          ...l.params,
          title: mailTitle({ title: String(l.params.title ?? ''), body: '', tpl: l.params.tpl as MailTpl }),
        }
      : l.params;
  return f ? f(params, names) : m.feed(l, (id) => names.foodName(id));
}

/** 流水（道具流水页）的名称 */
export function recordLabel(r: { kind: string; itemId: number | null }, names: Names): string {
  if (r.kind === 'goods') return names.goodsName(r.itemId ?? 0);
  if (r.kind === 'foods') return names.foodName(r.itemId ?? 0);
  const m = activeMessages().events;
  if (r.kind === 'remnant') return m.remnant(names, r.itemId ?? 0);
  if (r.kind === 'seed') return m.seed(names, r.itemId ?? 0);
  if (r.kind === 'basket') return m.basket(names.foodName(r.itemId ?? 0));
  return kindName(r.kind);
}

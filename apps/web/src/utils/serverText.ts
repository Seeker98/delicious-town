import { HAT_PREFIX, type EffectDto, type MailTpl, type TalkLine } from '@dt/shared';
import { activeLocale, activeMessages } from '../i18n';
import { formatNum } from './format';

/**
 * 服务端给代码和参数的文字按当前语言显示（问题记录 272）。
 * 旧数据、手动题、管理员写的邮件没有代码，显示服务端存的原文
 */

interface MailLike {
  title: string;
  body: string;
  tpl: MailTpl | null;
}

/** 模板参数补上前端才知道的名字：举报对象、帽子全名 */
function mailParams(tpl: MailTpl): Record<string, unknown> {
  const m = activeMessages();
  const p = { ...tpl.params };
  if (typeof p.target === 'string') p.targetName = m.server.reportTargets[p.target] ?? p.target;
  if (typeof p.name === 'string') {
    p.jade = m.util.reward.hat(HAT_PREFIX.jade, p.name);
    p.xuan = m.util.reward.hat(HAT_PREFIX.xuan, p.name);
  }
  return p;
}

const mailText = (tpl: MailTpl | null) => {
  const mails = activeMessages().server.mail;
  return tpl && Object.hasOwn(mails, tpl.key) ? mails[tpl.key] : null;
};

export function mailTitle(m: MailLike): string {
  const x = mailText(m.tpl);
  return x ? x.title(mailParams(m.tpl!)) : m.title;
}

export function mailBody(m: MailLike): string {
  const x = mailText(m.tpl);
  return x?.body ? x.body(mailParams(m.tpl!)) : m.body;
}

/** 游戏日（YYYY-MM-DD）写成"11月4日""Nov 4"：判定依据里写具体日期，事后看不会和"明天"混淆 */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat(activeLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** 嘻哈男孩的地点名；9 = 某家玩家餐厅 */
const placeName = (place: number) => activeMessages().town.places[String(place)] ?? String(place);

interface PredictLike {
  kind: string;
  title: string;
  params: Record<string, unknown>;
}

/** 自动题按参数渲染题目；参数不全（旧题）或手动题用原文 */
export function predictTitle(e: PredictLike): string {
  const t = activeMessages().server.predict;
  const p = e.params;
  if (e.kind === 'krab' && isNum(p.from) && isNum(p.to)) return t.krab.title(p.from, p.to);
  if (e.kind === 'hiphop' && isNum(p.place)) return t.hiphop.title(p.place === 9 ? null : placeName(p.place));
  if (e.kind === 'market' && isNum(p.hour) && isNum(p.level)) return t.market.title(p.hour, p.level);
  if (e.kind === 'weather' && isNum(p.hour) && isNum(p.type))
    return t.weather.title(p.hour, t.weather.types[p.type] ?? String(p.type));
  if (e.kind === 'stats') return t.stats.title;
  return e.title;
}

export function predictDesc(e: {
  kind: string;
  description: string;
  params: Record<string, unknown>;
}): string {
  const t = activeMessages().server.predict;
  const p = e.params;
  if (e.kind === 'krab' && isNum(p.hour)) return t.krab.desc(p.hour);
  if (e.kind === 'hiphop' && isNum(p.hour)) return t.hiphop.desc(p.hour);
  if (e.kind === 'market' && isNum(p.hour)) return t.market.desc(p.hour);
  if (e.kind === 'weather' && isNum(p.hour)) return t.weather.desc(p.hour);
  if (e.kind === 'stats' && isNum(p.close)) return t.stats.desc(p.close);
  return e.description;
}

export interface PredictNames {
  foodName(id: number): string;
  weatherName(id: number): string;
}

/** 判定依据：有参数按语言渲染，否则用原文 */
export function predictNote(
  e: { kind: string; resultNote: string | null; resultParams: Record<string, unknown> | null },
  x: PredictNames,
): string | null {
  const t = activeMessages().server.predict;
  const p = e.resultParams;
  if (!p) return e.resultNote;
  if (p.void === 'missing') return t.voidMissing;
  const day = isStr(p.day) ? dayLabel(p.day) : '';
  if (e.kind === 'krab' && isNum(p.hour) && isNum(p.street)) return t.krab.note(day, p.hour, p.street);
  if (e.kind === 'hiphop' && isNum(p.place)) return t.hiphop.note(day, placeName(p.place));
  if (e.kind === 'market' && isNum(p.hour) && isNum(p.level) && Array.isArray(p.foods)) {
    const foods = p.foods.map((id) => x.foodName(Number(id)));
    return foods.length > 0
      ? t.market.yes(day, p.hour, p.level, foods.join(activeMessages().events.sep))
      : t.market.no(day, p.hour, p.level);
  }
  if (e.kind === 'weather' && isNum(p.hour) && isNum(p.weather) && isNum(p.type)) {
    const note = t.weather.note(
      day,
      p.hour,
      x.weatherName(p.weather),
      t.weather.types[p.type] ?? String(p.type),
    );
    return isNum(p.hammerTo) ? note + t.weather.hammer(x.weatherName(p.hammerTo)) : note;
  }
  if (e.kind === 'stats' && isNum(p.today) && isNum(p.yesterday) && isStr(p.prevDay))
    return t.stats.note(day, formatNum(p.today), dayLabel(p.prevDay), formatNum(p.yesterday));
  return e.resultNote;
}

export function talkText(line: TalkLine | string): string {
  const t = activeMessages().server.talk;
  return Object.hasOwn(t, line) ? t[line as keyof typeof t] : line;
}

/** 外卖失败原因：有序号按语言，旧记录用原文 */
export function takeawayFailText(r: { reason: string | null; reasonId?: number | null }): string {
  const list = activeMessages().server.takeawayFail;
  return (isNum(r.reasonId) ? list[r.reasonId] : undefined) ?? r.reason ?? '';
}

export function appraiseFailText(r: { text?: string; textId?: number }): string {
  const list = activeMessages().server.appraiseFail;
  return (isNum(r.textId) ? list[r.textId] : undefined) ?? r.text ?? '';
}

export interface EffectNames {
  goods(id: number): unknown;
  goodsName(id: number): string;
  deviceName(id: number): string | undefined;
  suit(id: number): { name: string; tiers: Array<{ need: number }> } | undefined;
  /** 星愿名按目录取（第 8c 批）；测试里可以不传 */
  data?(kind: 'bless', id: number): { name: string } | undefined;
}

/**
 * 加成来源的名字：设施、套装、道具按目录取（跟着语言走）；
 * suit 的 sourceId = 套装 id × 10 + 档位下标；目录里没有时用服务端给的名字
 */
export function effectName(e: Pick<EffectDto, 'sourceType' | 'sourceId' | 'name'>, x: EffectNames): string {
  const t = activeMessages().server.effect;
  switch (e.sourceType) {
    case 'device':
      return x.deviceName(e.sourceId) ?? e.name;
    case 'equip':
      return t.equip;
    case 'bar':
      return t.hangover;
    case 'bless':
      return t.bless(x.data?.('bless', e.sourceId)?.name ?? e.name);
    case 'suit': {
      const suit = x.suit(Math.floor(e.sourceId / 10));
      const tier = suit?.tiers[e.sourceId % 10];
      return suit && tier ? t.suit(suit.name, tier.need) : e.name;
    }
    default:
      return x.goods(e.sourceId) ? x.goodsName(e.sourceId) : e.name;
  }
}

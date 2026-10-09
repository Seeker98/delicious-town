import { addDays, gameTime } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { GameDeps } from '../../core/deps';

/**
 * 小镇日报的素材（设计 §二）：前一天的新闻按重要程度挑，刷屏的只给一句汇总。
 * 店、道具、食材、特色菜、街、天气一律写成记号 {r:id} {g:id} {f:id} {m:id} {s:id} {w:id}：
 * 店名是玩家起的，根本不交给 AI（防提示注入）；网页按玩家的语言把记号换成名字
 */
export interface DailyEvent {
  kind: string;
  text: string;
  /** 原新闻的编号：没发布时“今日要闻”用 */
  newsId: number;
}

export interface DailyFacts {
  day: string;
  shopCount: number;
  summary: string[];
  /** 银币带千分位（AI 照抄数字，给原始数字它就写成 100220243） */
  topIncome: { rest: string; coin: string }[];
  events: DailyEvent[];
  /** 记号 → 简中名字（店除外），AI 据此知道是什么东西 */
  names: Record<string, string>;
}

type P = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const fmt = (n: number) => n.toLocaleString('en-US');
const deluxe = (p: P) => (p.line === 'deluxe' ? '豪华' : '');

interface TypeRule {
  kind: string;
  /** 权重：越大越靠前；0 = 不要 */
  weight: (p: P) => number;
  /** w 是这家店的记号；缺参数返回 null */
  text: (w: string, p: P) => string | null | false;
}

/** 逐条交给 AI 的新闻类型。玩家自己写的文字（广播、论坛）不在这里 */
export const DAILY_TYPES: Record<string, TypeRule> = {
  'kuji.big': {
    kind: '一番赏大赏',
    weight: () => 10,
    text: (w, p) =>
      p.tier === 'last'
        ? `${w} 抽走了${deluxe(p)}一番赏的最后一张签, 拿下最后赏`
        : str(p.tier) && `${w} 在${deluxe(p)}一番赏抽中了 ${str(p.tier)} 赏`,
  },
  'kuji.win': {
    kind: '一番赏',
    weight: () => 6,
    text: (w, p) => str(p.tier) && `${w} 在${deluxe(p)}一番赏抽中了 ${str(p.tier)} 赏`,
  },
  'acquire.big': {
    kind: '收购',
    weight: () => 10,
    text: (w, p) =>
      num(p.price) !== null && num(p.restId) !== null
        ? `${w} 以 ${fmt(num(p.price)!)} 银币${p.way === 'listed' ? '买下' : '收购'}了 {r:${num(p.restId)}}`
        : null,
  },
  'acquire.redeem': {
    kind: '赎身',
    weight: () => 8,
    text: (w, p) => num(p.price) !== null && `${w} 以 ${fmt(num(p.price)!)} 银币赎回了自己`,
  },
  'fund.big': {
    kind: '小镇发展基金',
    weight: () => 9,
    text: (w, p) =>
      num(p.coin) !== null && str(p.tier)
        ? `${w} 认购了 ${fmt(num(p.coin)!)} 银币小镇发展基金 ${str(p.tier)} 类份额`
        : null,
  },
  'bar.cup.big': { kind: '酒吧', weight: () => 9, text: (w) => `${w} 在酒吧猜酒杯一路猜中, 通关了` },
  'mc.champion': {
    kind: '特色菜',
    weight: () => 9,
    text: (w, p) => num(p.value) !== null && `${w} 成为特色菜价值第一 (${fmt(num(p.value)!)})`,
  },
  'predict.result': {
    kind: '事件预测',
    // 没人参与的开奖不值得写
    weight: (p) => (num(p.players) ? 8 : 0),
    text: (_w, p) => {
      // 题目是后台（协管也能出）写的：去掉花括号，免得写成 {r:N} 变成合法记号（backlog）
      const title = str(p.title)?.replace(/[{}｛｝]/g, '');
      if (!title) return null;
      if (p.outcome === null || p.outcome === undefined) return `事件预测「${title}」作废, 按净投入退款`;
      return `事件预测「${title}」开奖: 结果为${p.outcome ? '是' : '否'}, ${num(p.players) ?? 0} 家店参与, ${
        num(p.winners) ?? 0
      } 家押对, 共派出 ${fmt(num(p.paid) ?? 0)} 银币`;
    },
  },
  'star.up': {
    kind: '升星',
    weight: (p) => ((num(p.star) ?? 0) >= 3 ? 8 : 3),
    text: (w, p) => num(p.star) !== null && `${w} 升到了 ${num(p.star)} 星`,
  },
  'temple.guardian.rare': {
    kind: '神殿',
    weight: () => 7,
    text: (w, p) =>
      num(p.foodsId) !== null &&
      `${w} 击败守护兽获得 {f:${num(p.foodsId)}}${num(p.num) ? `×${num(p.num)}` : ''}`,
  },
  'temple.explore.rare': {
    kind: '神殿',
    weight: () => 4,
    text: (w, p) => {
      const foods = Array.isArray(p.foods)
        ? (p.foods as P[]).map((x) => num(x.foodsId)).filter((x) => x !== null)
        : [];
      if (foods.length === 0) return null;
      return `${w} 在神殿探险找到稀有食材 ${foods
        .slice(0, 3)
        .map((id) => `{f:${id}}`)
        .join(', ')}${foods.length > 3 ? ` 等 ${foods.length} 种` : ''}`;
    },
  },
  'plankton.driven': { kind: '痞老板', weight: () => 5, text: (w) => `${w} 赶走了痞老板` },
  'equip.stress': {
    kind: '强化',
    weight: (p) => ((num(p.stress) ?? 0) >= 8 ? 6 : 3),
    text: (w, p) =>
      num(p.goodsId) !== null && num(p.stress) !== null
        ? `${w} 把 {g:${num(p.goodsId)}} 强化到了 +${num(p.stress)}`
        : null,
  },
  'gem.levelUp': {
    kind: '宝石',
    weight: () => 4,
    text: (w, p) => num(p.goodsId) !== null && `${w} 升阶出 {g:${num(p.goodsId)}}×${num(p.num) ?? 1}`,
  },
  'oil.expand': {
    kind: '油壶',
    weight: () => 3,
    text: (w, p) => num(p.level) !== null && `${w} 把油壶扩容到 ${num(p.level)} 级`,
  },
  'rest.move': {
    kind: '搬家',
    weight: () => 3,
    text: (w, p) => num(p.to) !== null && `${w} 搬到了 {s:${num(p.to)}}`,
  },
  'mc.cook': {
    kind: '特色菜',
    weight: () => 2,
    text: (w, p) => num(p.mcId) !== null && `${w} 烹制出 {m:${num(p.mcId)}}×${num(p.num) ?? 1}`,
  },
  'shop.special': {
    kind: '商店',
    weight: () => 2,
    text: (_w, p) =>
      num(p.goodsId) !== null &&
      `商店今日特价${str(p.tier) ? ` (${str(p.tier)})` : ''}: {g:${num(p.goodsId)}}`,
  },
  'tower.rank.week': {
    kind: '厨塔周榜',
    weight: () => 6,
    text: (_w, p) => {
      const top = Array.isArray(p.top)
        ? (p.top as P[]).filter((x) => num(x.rank) !== null && num(x.restId) !== null).slice(0, 3)
        : [];
      if (top.length === 0) return null;
      return `厨塔周榜: ${top.map((x) => `第 ${num(x.rank)} 名 {r:${num(x.restId)}}`).join(', ')}`;
    },
  },
};

/** 不需要店的类型（系统新闻） */
const NO_REST = new Set(['predict.result', 'shop.special', 'tower.rank.week']);

export interface NewsLike {
  type: string;
  rest_id: number | null;
  params: unknown;
}

/** 一条新闻的简中素材；不认识的类型、缺参数返回 null */
export function eventText(n: NewsLike, _config: GameConfig): string | null {
  const rule = DAILY_TYPES[n.type];
  if (!rule) return null;
  if (n.rest_id === null && !NO_REST.has(n.type)) return null;
  const p = (n.params && typeof n.params === 'object' ? n.params : {}) as P;
  return rule.text(`{r:${n.rest_id}}`, p) || null;
}

const TOKEN_RE = /\{([rgfmsw]):(\d+)\}/g;

/** 文字里的全部记号（如 r:12、g:10704），排好序，重复的保留 */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN_RE)].map((m) => `${m[1]}:${m[2]}`).sort();
}

/** 记号的简中名字；店不给名字，查不到的也不给 */
function nameOf(token: string, config: GameConfig): string | undefined {
  const [k, v] = token.split(':') as [string, string];
  const id = Number(v);
  switch (k) {
    case 'g':
      return config.goods.get(id)?.name;
    case 'f':
      return config.foods.get(id)?.name;
    case 'm':
      return config.mysterious.get(id)?.name;
    case 's':
      return config.streets.get(id)?.name;
    case 'w':
      return config.weather.get(id)?.name;
    default:
      return undefined;
  }
}

const SUMMARY_TYPES = ['restaurant.open', 'market.restock', 'weather.change'];

/** 生成某区服某游戏日的素材 */
export async function buildFacts(
  d: GameDeps,
  shardId: number,
  day: string,
  maxEvents: number,
): Promise<DailyFacts> {
  const from = gameTime(day, 0);
  const to = gameTime(addDays(day, 1), 0);
  const rows = await d.db
    .selectFrom('news')
    .select(['id', 'type', 'rest_id', 'params'])
    .where('shard_id', '=', shardId)
    .where('created_at', '>=', from)
    .where('created_at', '<', to)
    .where('type', 'in', [...Object.keys(DAILY_TYPES), ...SUMMARY_TYPES])
    .orderBy('id', 'asc')
    .execute();

  let opened = 0;
  let restocks = 0;
  const weather: number[] = [];
  const candidates: { weight: number; id: number; key: string; event: DailyEvent }[] = [];
  for (const r of rows) {
    const p = (r.params && typeof r.params === 'object' ? r.params : {}) as P;
    if (r.type === 'restaurant.open') opened += 1;
    else if (r.type === 'market.restock') restocks += 1;
    else if (r.type === 'weather.change') {
      const [a, b] = [num(p.from), num(p.to)];
      if (weather.length === 0 && a !== null) weather.push(a);
      // 轮换又轮到同一种天气时不重复写
      if (b !== null && b !== weather.at(-1)) weather.push(b);
    } else {
      const rule = DAILY_TYPES[r.type]!;
      const weight = rule.weight(p);
      const text = weight > 0 ? eventText(r, d.config) : null;
      if (text === null) continue;
      const id = Number(r.id);
      candidates.push({
        weight,
        id,
        key: `${r.type}:${r.rest_id ?? `#${id}`}`,
        event: { kind: rule.kind, text, newsId: id },
      });
    }
  }
  // 权重高的在前，同权重新的在前；同一家店同一类只留最新的一条
  candidates.sort((a, b) => b.weight - a.weight || b.id - a.id);
  const seen = new Set<string>();
  const events: DailyEvent[] = [];
  for (const c of candidates) {
    if (events.length >= maxEvents) break;
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    events.push(c.event);
  }

  const summary: string[] = [];
  if (opened > 0) summary.push(`新开 ${opened} 家店`);
  if (restocks > 0) summary.push(`菜场进货 ${restocks} 次`);
  if (weather.length > 1)
    summary.push(
      `天气: ${weather
        .slice(0, 8)
        .map((w) => `{w:${w}}`)
        .join(' → ')}`,
    );

  const top = await d.db
    .selectFrom('rest_income_day as i')
    .innerJoin('restaurant as r', 'r.id', 'i.rest_id')
    .select(['i.rest_id', 'i.coin'])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('i.day', '=', day)
    .orderBy('i.coin', 'desc')
    .orderBy('i.rest_id')
    .limit(3)
    .execute();
  const shops = await d.db
    .selectFrom('restaurant')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('shard_id', '=', shardId)
    .where('npc', '=', false)
    .executeTakeFirstOrThrow();

  const facts: DailyFacts = {
    day,
    shopCount: Number(shops.n),
    summary,
    topIncome: top.map((x) => ({ rest: `{r:${x.rest_id}}`, coin: fmt(Number(x.coin)) })),
    events,
    names: {},
  };
  for (const tok of new Set(tokensIn(JSON.stringify(facts)))) {
    const name = nameOf(tok, d.config);
    if (name !== undefined) facts.names[tok] = name;
  }
  return facts;
}

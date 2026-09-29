import { sql, type Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { DB } from '../db/schema';
import { normalizeCounts } from '../modules/settlement/globals';
import type { Bot } from './bot';

/** 每个机器人每天 0 点的状态 */
export interface BotDay {
  day: number;
  bot: string;
  persona: string;
  level: number;
  star: number;
  coin: number;
  diamond: number;
  learned: number;
  certs: number;
  oilLevel: number;
  renown: number;
}

export interface EconomyRow {
  day: string;
  kind: string;
  source: string;
  delta: number;
}

export interface StuckRow {
  bot: string;
  persona: string;
  star: number;
  days: number;
  lacking: string[];
}

export async function snapshot(db: Kysely<DB>, bots: Bot[], dayIndex: number): Promise<BotDay[]> {
  const ids = bots.map((b) => b.ctx.restaurantId);
  const rows = await db.selectFrom('restaurant').selectAll().where('id', 'in', ids).execute();
  const certs = await db
    .selectFrom('store_item')
    .select(['rest_id', 'num'])
    .where('rest_id', 'in', ids)
    .where('goods_id', '=', GOODS.starCert)
    .execute();
  const certMap = new Map(certs.map((c) => [c.rest_id, c.num]));
  return bots.map((b) => {
    const r = rows.find((x) => x.id === b.ctx.restaurantId)!;
    return {
      day: dayIndex,
      bot: b.name,
      persona: b.persona.key,
      level: r.level,
      star: r.star_level,
      coin: r.coin,
      diamond: r.diamond,
      learned: normalizeCounts(r.cookbook_counts).learned,
      certs: certMap.get(r.id) ?? 0,
      oilLevel: r.oil_level,
      renown: r.renown,
    };
  });
}

/** 按北京时间的日期汇总：流水（按种类和来源）+ 结算收益 */
export async function economyOf(db: Kysely<DB>, restIds: number[]): Promise<EconomyRow[]> {
  const ledger = await sql<EconomyRow>`
    select to_char((created_at at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as day,
           kind, source, sum(delta)::bigint as delta
    from ledger where rest_id = any(${restIds}::int[])
    group by 1, 2, 3 order by 1, 2, 3`.execute(db);
  const income = await sql<{ day: string; coin: number; exp: number }>`
    select to_char((created_at at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as day,
           sum(coin)::bigint as coin, sum(exp)::bigint as exp
    from income_round where rest_id = any(${restIds}::int[])
    group by 1 order by 1`.execute(db);
  const out = ledger.rows.map((r) => ({ ...r, delta: Number(r.delta) }));
  for (const r of income.rows) {
    out.push({ day: r.day, kind: 'coin', source: 'settlement', delta: Number(r.coin) });
    out.push({ day: r.day, kind: 'exp', source: 'settlement', delta: Number(r.exp) });
  }
  return out;
}

/** 卡点：等级已满足下一星要求，却连续 threshold 天以上没升星；列出当时还缺的条件 */
export function detectStuck(days: BotDay[], config: GameConfig, threshold: number): StuckRow[] {
  const out: StuckRow[] = [];
  const byBot = new Map<string, BotDay[]>();
  for (const d of days) byBot.set(d.bot, [...(byBot.get(d.bot) ?? []), d]);
  for (const [bot, list] of byBot) {
    list.sort((a, b) => a.day - b.day);
    const last = list.at(-1)!;
    const need = config.starNeed.get(last.star + 1);
    if (!need || need.cookbooksKind !== 'learned') continue;
    const since = list.find((d) => d.star === last.star && d.level >= need.needLevel);
    if (!since) continue;
    const stuckDays = last.day - since.day;
    if (stuckDays < threshold) continue;
    const lacking: string[] = [];
    if (last.learned < need.needCookbooks) lacking.push('cookbooks');
    if (last.certs < need.needCerts) lacking.push('certs');
    out.push({ bot, persona: last.persona, star: last.star, days: stuckDays, lacking });
  }
  return out;
}

/** 每种画像到达每个星级的平均天数（取每个机器人第一次达到的那天） */
export function starDays(days: BotDay[]): Record<string, Record<string, number>> {
  const first = new Map<string, Map<number, number>>();
  const personaOf = new Map<string, string>();
  for (const d of [...days].sort((a, b) => a.day - b.day)) {
    personaOf.set(d.bot, d.persona);
    const m = first.get(d.bot) ?? new Map<number, number>();
    for (let s = 1; s <= d.star; s++) if (!m.has(s)) m.set(s, d.day);
    first.set(d.bot, m);
  }
  const acc = new Map<string, Map<number, number[]>>();
  for (const [bot, m] of first) {
    const p = personaOf.get(bot)!;
    const pm = acc.get(p) ?? new Map<number, number[]>();
    for (const [s, day] of m) pm.set(s, [...(pm.get(s) ?? []), day]);
    acc.set(p, pm);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const [p, pm] of acc) {
    out[p] = {};
    for (const [s, list] of pm)
      out[p]![String(s)] = Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 10) / 10;
  }
  return out;
}

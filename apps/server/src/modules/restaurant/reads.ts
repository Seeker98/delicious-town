import type { Kysely } from 'kysely';
import type { Device, GameConfig } from '@dt/config';
import { gameDay, gameTime } from '@dt/shared';
import type {
  BuffsDto,
  DeviceSlotDto,
  IncomePageDto,
  LogPageDto,
  PageQuery,
  RateBreakdownDto,
  RoundSummaryDto,
  TableDto,
} from '@dt/shared';
import type { DB, RestaurantRow, TableState } from '../../db/schema';
import { listActiveEffects } from '../effects/service';
import { shownEffects } from '../effects/aggregate';
import { effectSourceName } from '../effects/naming';

/** 设施位是否已开放：星级够；第二牌匾位（7）还要先开通 */
export function slotUnlocked(d: Device, rest: Pick<RestaurantRow, 'star_level' | 'plaque2_open'>): boolean {
  return rest.star_level >= d.needStar && (d.id !== 7 || rest.plaque2_open);
}

export async function deviceSlots(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  now: Date,
): Promise<DeviceSlotDto[]> {
  const rows = await db.selectFrom('restaurant_device').selectAll().where('rest_id', '=', rest.id).execute();
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  return [...config.devices.values()]
    .sort((a, b) => a.id - b.id)
    .map((d) => {
      const row = bySlot.get(d.id);
      const active = row !== undefined && (row.expires_at === null || row.expires_at > now);
      return {
        slot: d.id,
        name: d.name,
        deviceType: d.deviceType,
        needStar: d.needStar,
        unlocked: slotUnlocked(d, rest),
        goodsId: active ? row.goods_id : null,
        expiresAt: active && row.expires_at ? row.expires_at.toISOString() : null,
      };
    });
}

export function tableDto(t: TableState, names?: ReadonlyMap<number, string>): TableDto {
  return {
    no: t.no,
    floor: t.floor,
    customer: t.customer,
    ...(t.roach ? { roach: true, roachBy: t.roach.by } : {}),
    ...(t.freeloader
      ? {
          freeloaderRestId: t.freeloader.restId,
          freeloaderSince: t.freeloader.since,
          ...(names?.has(t.freeloader.restId) ? { freeloaderName: names.get(t.freeloader.restId)! } : {}),
        }
      : {}),
    ...(t.last ? { last: t.last } : {}),
  };
}

/** 一批餐厅的名称 */
export async function restNames(db: Kysely<DB>, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.selectFrom('restaurant').select(['id', 'name']).where('id', 'in', ids).execute();
  return new Map(rows.map((r) => [r.id, r.name]));
}

type IncomeRow = {
  round_no: number;
  coin: number;
  exp: number;
  oil: number;
  customers: Record<string, number>;
  created_at: Date;
};

function roundDto(r: IncomeRow): RoundSummaryDto {
  return {
    roundNo: r.round_no,
    coin: r.coin,
    exp: r.exp,
    oil: r.oil,
    customers: r.customers,
    at: r.created_at.toISOString(),
  };
}

export async function lastRound(db: Kysely<DB>, restId: number): Promise<RoundSummaryDto | null> {
  const r = await db
    .selectFrom('income_round')
    .select(['round_no', 'coin', 'exp', 'oil', 'customers', 'created_at'])
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return r ? roundDto(r) : null;
}

/** 游标"时间~id"：同一时刻写的多条记录按 id 继续往下翻，不会整组跳过 */
export function parseCursor(before: string): { at: Date; id: string | null } {
  const [at, id] = before.split('~');
  return { at: new Date(at!), id: id ?? null };
}
export const cursorOf = (at: Date, id: string | number) => `${at.toISOString()}~${id}`;

/** now 给了且是第一页时带今天的小计（问题记录 530） */
export async function incomePage(
  db: Kysely<DB>,
  restId: number,
  q: PageQuery,
  now?: Date,
): Promise<IncomePageDto> {
  let s = db
    .selectFrom('income_round')
    .select(['id', 'round_no', 'coin', 'exp', 'oil', 'customers', 'created_at'])
    .where('rest_id', '=', restId);
  if (q.before) {
    const c = parseCursor(q.before);
    s = c.id
      ? s.where((eb) =>
          eb.or([
            eb('created_at', '<', c.at),
            eb.and([eb('created_at', '=', c.at), eb('id', '<', Number(c.id))]),
          ]),
        )
      : s.where('created_at', '<', c.at);
  }
  const rows = await s
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(q.limit + 1)
    .execute();
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const out: IncomePageDto = {
    items: page.map(roundDto),
    nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
  };
  if (now && !q.before) {
    const t = await db
      .selectFrom('income_round')
      .select((eb) => [
        eb.fn.countAll<string>().as('rounds'),
        eb.fn.coalesce(eb.fn.sum<string>('coin'), eb.lit(0)).as('coin'),
        eb.fn.coalesce(eb.fn.sum<string>('exp'), eb.lit(0)).as('exp'),
        eb.fn.coalesce(eb.fn.sum<string>('oil'), eb.lit(0)).as('oil'),
      ])
      .where('rest_id', '=', restId)
      .where('created_at', '>=', gameTime(gameDay(now), 0))
      .executeTakeFirstOrThrow();
    out.today = { rounds: Number(t.rounds), coin: Number(t.coin), exp: Number(t.exp), oil: Number(t.oil) };
  }
  return out;
}

export async function buffsOf(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  now: Date,
  equipOff = false,
): Promise<BuffsDto> {
  const r = await db
    .selectFrom('income_round')
    .select(['round_no', 'rates'])
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const effects = shownEffects(await listActiveEffects(db, restId, now), equipOff);
  const raw = (r?.rates ?? null) as (Record<string, unknown> & { seated?: number }) | null;
  let rates: Record<string, RateBreakdownDto> | null = null;
  if (raw) {
    rates = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'object' && v !== null && 'total' in v) rates[k] = v as RateBreakdownDto;
    }
  }
  return {
    roundNo: r?.round_no ?? null,
    rates,
    seated: raw?.seated ?? null,
    sources: effects.map((e) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      name: effectSourceName(e, config),
      effects: e.effects,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    })),
  };
}

/**
 * 餐厅动态：别人对我做的操作（设计文档 §4.10），加上不在线时店里发生的事（问题记录 553：被收购 / 放手 / 赎回、
 * 老鼠偷食材、手动进货被买、冰箱满了丢食材）。好友页"动态"卡和首页的"餐厅动态"都用它
 */
export const FEED_TYPES = [
  'dine.start',
  'dine.expelled',
  'roach.laid',
  'roach.killed',
  'friend.refuel',
  'friend.flip',
  'exchange',
  'thumb',
  'mc.eaten',
  'lesson.taught',
  'friend.apply',
  'friend.accept',
  'yard.helped',
  'yard.stolen',
  'takeaway.hired',
  'dine.left',
  'forum.replied',
  'acquire.taken',
  'acquire.freed',
  'acquire.lost',
  'mouse.steal',
  'market.share',
  'fridge.drop',
] as const;
const FEED_DAYS = 3;

/** 累计获赞（问题记录 553）：用任务的全历史计数 thumbs.received，不用数点赞表 */
export async function thumbsReceived(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('event_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('key', '=', 'thumbs.received')
    .executeTakeFirst();
  return r ? Number(r.count) : 0;
}

/** 餐厅动态（最近 FEED_DAYS 天）：好友页"动态"卡翻页，首页取最新几条 */
export function feedPage(db: Kysely<DB>, restId: number, q: PageQuery, now: Date): Promise<LogPageDto> {
  return logPage(db, restId, q, {
    types: FEED_TYPES,
    since: new Date(now.getTime() - FEED_DAYS * 86_400_000),
  });
}

export async function logPage(
  db: Kysely<DB>,
  restId: number,
  q: PageQuery,
  filter: { types?: readonly string[]; since?: Date } = {},
): Promise<LogPageDto> {
  let s = db
    .selectFrom('rest_log')
    .select(['id', 'type', 'params', 'created_at'])
    .where('rest_id', '=', restId);
  if (filter.types) s = s.where('type', 'in', [...filter.types]);
  if (filter.since) s = s.where('created_at', '>=', filter.since);
  if (q.before) {
    const c = parseCursor(q.before);
    s = c.id
      ? s.where((eb) =>
          eb.or([
            eb('created_at', '<', c.at),
            eb.and([eb('created_at', '=', c.at), eb('id', '<', Number(c.id))]),
          ]),
        )
      : s.where('created_at', '<', c.at);
  }
  const rows = await s
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(q.limit + 1)
    .execute();
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({ type: r.type, params: r.params, at: r.created_at.toISOString() })),
    nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
  };
}

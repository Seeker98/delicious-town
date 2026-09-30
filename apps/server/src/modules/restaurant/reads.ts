import type { Kysely } from 'kysely';
import type { Device, GameConfig } from '@dt/config';
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

export async function incomePage(db: Kysely<DB>, restId: number, q: PageQuery): Promise<IncomePageDto> {
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
  return {
    items: page.map(roundDto),
    nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
  };
}

export async function buffsOf(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  now: Date,
): Promise<BuffsDto> {
  const r = await db
    .selectFrom('income_round')
    .select(['round_no', 'rates'])
    .where('rest_id', '=', restId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const effects = await listActiveEffects(db, restId, now);
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

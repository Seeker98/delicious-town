import type { Kysely } from 'kysely';
import type { ExchangeFlag } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { ExchangeTuning } from './rules';

type Suspicious = ExchangeTuning['suspicious'];

/**
 * 关联账号（156-2 设计 §4.1）：others 里每个账号和我的关系。
 * 共用过设备 → device（撮合时跳过）；只共用过 IP → ip（照常成交、标记）。设备 id 为空的记录不参与设备比对
 */
export async function linkedAccounts(
  db: Kysely<DB>,
  me: { accountId: number; ip: string; deviceId: string | null },
  others: number[],
  days: number,
  now: Date,
): Promise<Map<number, 'device' | 'ip'>> {
  const out = new Map<number, 'device' | 'ip'>();
  const ids = others.filter((x) => x !== me.accountId);
  if (ids.length === 0) return out;
  const since = new Date(now.getTime() - days * 86_400_000);
  const mine = await db
    .selectFrom('login_trace')
    .select(['ip', 'device_id'])
    .where('account_id', '=', me.accountId)
    .where('last_seen', '>=', since)
    .execute();
  const ips = new Set([me.ip, ...mine.map((x) => x.ip)]);
  const devices = new Set(
    [me.deviceId, ...mine.map((x) => x.device_id)].filter(
      (x): x is string => typeof x === 'string' && x !== '',
    ),
  );
  const rows = await db
    .selectFrom('login_trace')
    .select(['account_id', 'ip', 'device_id'])
    .where('account_id', 'in', ids)
    .where('last_seen', '>=', since)
    .execute();
  for (const r of rows) {
    if (r.device_id && devices.has(r.device_id)) out.set(r.account_id, 'device');
    else if (ips.has(r.ip) && out.get(r.account_id) !== 'device') out.set(r.account_id, 'ip');
  }
  return out;
}

/** 一笔成交的可疑标记（156-2 设计 §4.2）；pairCount 是这对账号近 repeatDays 天的成交笔数，算上这一笔 */
export function tradeFlags(
  x: { link: 'device' | 'ip' | undefined; price: number; qty: number; ref: number; pairCount: number },
  s: Suspicious,
): ExchangeFlag[] {
  const out: ExchangeFlag[] = [];
  if (x.link === 'ip') out.push('same_ip');
  if (x.price >= x.ref * s.edgeHigh || x.price <= x.ref * s.edgeLow) out.push('edge_price');
  if (x.pairCount >= s.repeatCount) out.push('repeat_pair');
  if (x.price * x.qty >= s.largeAmount) out.push('large');
  return out;
}

/** 店的交易所是否被冻结；冻结时返回原因 */
export async function frozenReason(db: Kysely<DB>, restId: number): Promise<string | null> {
  const r = await db
    .selectFrom('exchange_freeze')
    .select('reason')
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  return r?.reason ?? null;
}

/** 冷静期的冻结记录（156-2 设计 §5） */
export async function addHold(
  db: Kysely<DB>,
  h: { restId: number; tradeId: string; coin: number; foodsId: number | null; num: number; releaseAt: Date },
): Promise<void> {
  await db
    .insertInto('exchange_hold')
    .values({
      rest_id: h.restId,
      trade_id: h.tradeId,
      coin: h.coin,
      foods_id: h.foodsId,
      num: h.num,
      release_at: h.releaseAt,
      status: 'held',
    })
    .execute();
}

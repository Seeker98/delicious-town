import { sql } from 'kysely';
import { addDays, gameDay, gameTime, ROUND_MS, type HygieneReportParams } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { bumpCountersFor } from '../achieve/counters';

/** 巡查哪些店：和防虫设施开放的星级一致（设施第 4、5 格要 2 星） */
export const HYGIENE_MIN_STAR = 2;
const MOUSE_TYPES = ['mouse.trap', 'mouse.escape', 'mouse.nothing', 'mouse.steal'] as const;
const CHUNK = 500;
/** 隐藏成就“卫生不合格”：巡查报告里前一天自己长的蟑螂占桌满这么多小时（桌·小时） */
export const HYGIENE_BAD_HOURS = 24;

type Device = { goodsId: number; hours: number };

/**
 * 章鱼哥的卫生巡查（小镇委员会 2026-10-16）：每个游戏日开头，给 2 星以上、前一天营业过的店写一条
 * 餐厅动态，只写前一天的事实，不罚、不评级。蟑螂只算自己长的（结算里的 n3），好友放的不算
 */
export async function hygieneRound(d: GameDeps, shardId: number, now: Date): Promise<{ reports: number }> {
  const today = gameDay(now);
  const day = addDays(today, -1);
  const from = gameTime(day, 0);
  const to = gameTime(today, 0);
  const rests = await d.db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('npc', '=', false)
    .where('star_level', '>=', HYGIENE_MIN_STAR)
    .orderBy('id')
    .execute();
  let reports = 0;
  for (let i = 0; i < rests.length; i += CHUNK) {
    const ids = rests.slice(i, i + CHUNK).map((r) => r.id);
    const [rounds, mice, devices] = await Promise.all([
      d.db
        .selectFrom('income_round')
        .select((eb) => [
          'rest_id',
          eb.fn.countAll<string>().as('rounds'),
          sql<string>`coalesce(sum((customers->>'n3')::int), 0)`.as('n3'),
          sql<string>`coalesce(sum((customers->>'-3')::int), 0)`.as('auto'),
        ])
        .where('rest_id', 'in', ids)
        .where('created_at', '>=', from)
        .where('created_at', '<', to)
        .groupBy('rest_id')
        .execute(),
      d.db
        .selectFrom('rest_log')
        .select((eb) => [
          'rest_id',
          'type',
          eb.fn.countAll<string>().as('n'),
          sql<string>`coalesce(sum((params->>'num')::int), 0)`.as('num'),
        ])
        .where('rest_id', 'in', ids)
        .where('type', 'in', [...MOUSE_TYPES])
        .where('created_at', '>=', from)
        .where('created_at', '<', to)
        .groupBy(['rest_id', 'type'])
        .execute(),
      d.db
        .selectFrom('restaurant_device')
        .select(['rest_id', 'goods_id', 'expires_at'])
        .where('rest_id', 'in', ids)
        .where('expires_at', '>', now)
        .execute(),
    ]);
    const devOf = new Map<number, { roach: Device | null; mouse: Device | null }>();
    for (const r of devices) {
      const g = d.config.goods.get(r.goods_id);
      if (!g || !r.expires_at) continue;
      const kind =
        (g.effects.roachClearRate ?? 0) > 0 ? 'roach' : (g.effects.trapRate ?? 0) > 0 ? 'mouse' : null;
      if (!kind) continue;
      const m = devOf.get(r.rest_id) ?? { roach: null, mouse: null };
      const hours = Math.floor((r.expires_at.getTime() - now.getTime()) / 3_600_000);
      // 同一类摆了两个（不同格子）时写剩得久的那个
      if (!m[kind] || m[kind]!.hours < hours) m[kind] = { goodsId: r.goods_id, hours };
      devOf.set(r.rest_id, m);
    }
    const mouseOf = new Map<number, { mouse: number; stolen: number; trapped: number }>();
    for (const r of mice) {
      const m = mouseOf.get(r.rest_id) ?? { mouse: 0, stolen: 0, trapped: 0 };
      m.mouse += Number(r.n);
      if (r.type === 'mouse.steal') m.stolen += Number(r.num);
      if (r.type === 'mouse.trap') m.trapped += Number(r.n);
      mouseOf.set(r.rest_id, m);
    }
    // 前一天一轮都没结算（停业、没开店）的不写
    const rows = rounds
      .filter((r) => Number(r.rounds) > 0)
      .map((r) => {
        const m = mouseOf.get(r.rest_id) ?? { mouse: 0, stolen: 0, trapped: 0 };
        const dev = devOf.get(r.rest_id);
        const params: HygieneReportParams = {
          day,
          roachHours: Math.round((Number(r.n3) * ROUND_MS) / 360_000) / 10,
          roachAuto: Number(r.auto),
          ...m,
          roachDevice: dev?.roach ?? null,
          mouseDevice: dev?.mouse ?? null,
        };
        return {
          rest_id: r.rest_id,
          type: 'hygiene.report',
          params: JSON.stringify(params),
          created_at: now,
        };
      });
    if (rows.length > 0) await d.db.insertInto('rest_log').values(rows).execute();
    reports += rows.length;
    for (const r of rows) {
      if ((JSON.parse(r.params) as HygieneReportParams).roachHours < HYGIENE_BAD_HOURS) continue;
      // 记成就出错不能拦着后面几批店的巡查报告（报告已经写了）
      await d.db
        .transaction()
        .execute((tx) => bumpCountersFor(d, tx, { shardId, restId: r.rest_id, now }, [['hygiene.bad', 1]]))
        .catch(() => undefined);
    }
  }
  return { reports };
}

/** 每个游戏日一次，挂在 restaurant 上（不随别的功能开关） */
export function commissionJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'commission-hygiene',
      feature: 'restaurant',
      period: (now) => gameDay(now),
      run: ({ shardId, now }) => hygieneRound(d, shardId, now),
    },
  ];
}

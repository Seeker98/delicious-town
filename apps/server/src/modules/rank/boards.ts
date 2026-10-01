import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { GameConfig } from '@dt/config';
import { addDays, gameDay, gameTime } from '@dt/shared';
import type { DB } from '../../db/schema';
import { restPower } from '../equip/power';
import { mondayOf } from '../friend/weekly';
import { tipTotals } from '../hiphop/weekly';
import type { RankSource } from './ranking';

export interface BoardCtx {
  db: Kysely<DB>;
  shardId: number;
  now: Date;
  config: GameConfig;
}

type Source = (c: BoardCtx) => Promise<RankSource[]>;
type Period = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek';
interface Row {
  rest_id: number;
  name: string;
  v: number | string;
  tie?: number | string | null;
}

/** 本区玩家店：不含 NPC 和封禁账号（r = restaurant，a = account） */
const players = (shardId: number) => sql`r.shard_id = ${shardId} and not r.npc and a.banned_at is null`;
const JOIN = sql`join restaurant r on r.id = x.rest_id join account a on a.id = r.account_id`;

async function run(c: BoardCtx, q: RawBuilder<Row>): Promise<RankSource[]> {
  const { rows } = await q.execute(c.db);
  return rows.map((r) => ({
    restId: r.rest_id,
    name: r.name,
    value: Number(r.v),
    ...(r.tie !== undefined && r.tie !== null ? { tie: Number(r.tie) } : {}),
  }));
}

/** 时间范围（按游戏日）：日期字符串 [from, to] 和时刻 [fromAt, toAt) */
function range(now: Date, p: Period): { from: string; to: string; fromAt: Date; toAt: Date } {
  const day = gameDay(now);
  const mon = mondayOf(day);
  const [from, to] =
    p === 'today'
      ? [day, day]
      : p === 'yesterday'
        ? [addDays(day, -1), addDays(day, -1)]
        : p === 'thisWeek'
          ? [mon, day]
          : [addDays(mon, -7), addDays(mon, -1)];
  return { from, to, fromAt: gameTime(from, 0), toAt: gameTime(addDays(to, 1), 0) };
}

const counter =
  (key: string, p: Period): Source =>
  (c) => {
    const { from, to } = range(c.now, p);
    return run(
      c,
      sql<Row>`select x.rest_id, r.name, sum(x.count)::float8 as v
        from daily_counter x ${JOIN}
        where ${players(c.shardId)} and x.key = ${key} and x.day >= ${from} and x.day <= ${to}
        group by x.rest_id, r.name`,
    );
  };

const income =
  (col: 'coin' | 'exp', p: 'today' | 'yesterday' | 'round'): Source =>
  (c) => {
    const v = sql.ref(`x.${col}`);
    if (p === 'round') {
      // 只看最近一天：让按时间分区的表和 (rest_id, created_at) 索引生效，也不把很久以前的轮次当"单轮"（终审 I3）
      const since = new Date(c.now.getTime() - 86_400_000);
      return run(
        c,
        sql<Row>`select x.rest_id, r.name, sum(${v})::float8 as v
          from income_round x ${JOIN}
          where ${players(c.shardId)} and x.created_at >= ${since} and x.round_no = (
            select max(x.round_no) from income_round x ${JOIN}
            where ${players(c.shardId)} and x.created_at >= ${since}
          )
          group by x.rest_id, r.name`,
      );
    }
    const { fromAt, toAt } = range(c.now, p);
    return run(
      c,
      sql<Row>`select x.rest_id, r.name, sum(${v})::float8 as v
        from income_round x ${JOIN}
        where ${players(c.shardId)} and x.created_at >= ${fromAt} and x.created_at < ${toAt}
        group by x.rest_id, r.name`,
    );
  };

/** restaurant 表上的一列；tie 可选 */
const column =
  (col: string, tie?: string): Source =>
  (c) =>
    run(
      c,
      sql<Row>`select r.id as rest_id, r.name, ${sql.ref(`r.${col}`)}::float8 as v
        ${tie ? sql`, ${sql.ref(`r.${tie}`)}::float8 as tie` : sql``}
        from restaurant r join account a on a.id = r.account_id
        where ${players(c.shardId)}`,
    );

/** 食谱：levels 每个字节是一个食谱的品级，数 ≥ min 的个数 */
const cookbook =
  (min: number): Source =>
  async (c) => {
    const { rows } = await sql<{ rest_id: number; name: string; levels: Buffer }>`
      select x.rest_id, r.name, x.levels from restaurant_cookbooks x ${JOIN} where ${players(c.shardId)}`.execute(
      c.db,
    );
    return rows.map((r) => ({
      restId: r.rest_id,
      name: r.name,
      value: [...r.levels].filter((lv) => lv >= min).length,
    }));
  };

const power: Source = async (c) => {
  const rows = await c.db
    .selectFrom('restaurant as r')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .selectAll('r')
    .where('r.shard_id', '=', c.shardId)
    .where('r.npc', '=', false)
    .where('a.banned_at', 'is', null)
    .execute();
  const out: RankSource[] = [];
  for (const r of rows)
    out.push({ restId: r.id, name: r.name, value: await restPower(c.db, r, c.config.suits) });
  return out;
};

const thumbs =
  (col: 'to_rest' | 'from_rest'): Source =>
  (c) =>
    run(
      c,
      sql<Row>`select r.id as rest_id, r.name, count(*)::float8 as v
        from thumb x join restaurant r on r.id = ${sql.ref(`x.${col}`)} join account a on a.id = r.account_id
        where ${players(c.shardId)}
        group by r.id, r.name`,
    );

/** 酒吧当前连续次数：*_result = 1 为连胜 / 连中，-1 为连败 / 连不中（bar/rules.ts BarResult） */
const bar =
  (game: 'fg' | 'cup' | 'num', result: 1 | -1): Source =>
  (c) =>
    run(
      c,
      sql<Row>`select x.rest_id, r.name, ${sql.ref(`x.${game}_times`)}::float8 as v
        from bar_state x ${JOIN}
        where ${players(c.shardId)} and ${sql.ref(`x.${game}_result`)} = ${result}`,
    );

/** 特色菜：单批价值 = 份数 × 单价，取最大；次数为批数 */
const mc =
  (kind: 'value' | 'times', p?: 'today' | 'yesterday'): Source =>
  (c) => {
    const agg = kind === 'value' ? sql`max(x.total_num::float8 * x.price)` : sql`count(*)::float8`;
    const when = p
      ? (() => {
          const { fromAt, toAt } = range(c.now, p);
          return sql`and x.created_at >= ${fromAt} and x.created_at < ${toAt}`;
        })()
      : sql``;
    return run(
      c,
      sql<Row>`select x.rest_id, r.name, ${agg} as v
        from mc_cook x ${JOIN}
        where ${players(c.shardId)} ${when}
        group by x.rest_id, r.name`,
    );
  };

const mcLearned: Source = (c) =>
  run(
    c,
    sql<Row>`select x.rest_id, r.name, count(*)::float8 as v
      from rest_mc x ${JOIN}
      where ${players(c.shardId)}
      group by x.rest_id, r.name`,
  );

const hiphop =
  (p: 'thisWeek' | 'lastWeek'): Source =>
  (c) => {
    const { fromAt, toAt } = range(c.now, p);
    return tipTotals(c.db, c.shardId, fromAt, toAt);
  };

const PERIODS: Period[] = ['today', 'yesterday', 'thisWeek', 'lastWeek'];
const periodSources = (prefix: string, key: string): Record<string, Source> =>
  Object.fromEntries(PERIODS.map((p) => [`${prefix}.${p}`, counter(key, p)]));

/** 每个榜一个查询，返回本区玩家店的原始值（未排序、未截断）；key 与 @dt/shared 的 RANK_BOARDS 一一对应 */
export const BOARD_SOURCES: Record<string, Source> = {
  'income.coin.today': income('coin', 'today'),
  'income.coin.round': income('coin', 'round'),
  'income.coin.yesterday': income('coin', 'yesterday'),
  'income.exp.today': income('exp', 'today'),
  'income.exp.round': income('exp', 'round'),
  'income.exp.yesterday': income('exp', 'yesterday'),
  'cookbook.7': cookbook(7),
  'cookbook.6': cookbook(6),
  'cookbook.5': cookbook(5),
  'cookbook.4': cookbook(4),
  'cookbook.1': cookbook(1),
  level: column('level', 'exp'),
  power,
  renown: column('renown'),
  'thumb.received': thumbs('to_rest'),
  'thumb.given': thumbs('from_rest'),
  ...periodSources('roach.kill', 'roach.kill'),
  ...periodSources('roach.lay', 'roach.lay'),
  ...periodSources('flip.flipped', 'flip.flipped'),
  'bar.fg.win': bar('fg', 1),
  'bar.fg.lose': bar('fg', -1),
  'bar.cup.win': bar('cup', 1),
  'bar.cup.lose': bar('cup', -1),
  'bar.num.win': bar('num', 1),
  'bar.num.lose': bar('num', -1),
  'mc.today': mc('value', 'today'),
  'mc.yesterday': mc('value', 'yesterday'),
  'mc.best': mc('value'),
  'mc.times': mc('times'),
  'mc.learned': mcLearned,
  'hiphop.week': hiphop('thisWeek'),
  'hiphop.lastWeek': hiphop('lastWeek'),
};

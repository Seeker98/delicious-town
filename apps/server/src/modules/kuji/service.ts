import { sql } from 'kysely';
import { GOODS, type Tuning } from '@dt/config';
import { gameDay, type KujiAwardDto, type KujiDrawDto, type KujiLine, type KujiViewDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { emitAction } from '../../core/action';
import { opNews, restLog, runOp, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { grantAward } from '../award/award';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { currentPool, latestToday, prizesOf, tierLeft, type PoolRow } from './pool';

type K = Tuning['kuji'];
const BUY_KEY = 'kuji.buy';
/** 一条奖池线的配置（240-2）：普通池就是 tuning.kuji，豪华池是 tuning.kuji.deluxe */
type LineConf = Pick<K, 'price' | 'dailyBuy' | 'maxDraw' | 'maxPools' | 'tiers' | 'last'>;
const conf = (k: K, line: KujiLine): LineConf => (line === 'deluxe' ? k.deluxe : k);
const ticketOf = (line: KujiLine) => (line === 'deluxe' ? GOODS.kujiDeluxeTicket : GOODS.kujiTicket);
const buyKeyOf = (line: KujiLine) => (line === 'deluxe' ? 'kuji.deluxe.buy' : BUY_KEY);
const RECENT = 10;

const awardDto = (a: K['last']['award']): KujiAwardDto => JSON.parse(JSON.stringify(a)) as KujiAwardDto;

async function grantIcon(o: Op, key: string): Promise<void> {
  await o.tx
    .insertInto('rest_icon')
    .values({ rest_id: o.rest.id, icon_key: key })
    .onConflict((oc) => oc.columns(['rest_id', 'icon_key']).doNothing())
    .execute();
}

/** 发一档的奖：奖品、图标、新闻（一番赏设计 §5.4、§6） */
async function prize(
  o: Op,
  tier: string,
  p: { award: K['last']['award']; icon?: string; news?: 'broadcast' | 'news' },
  pool: PoolRow,
) {
  await grantAward(o, p.award, { source: 'kuji' });
  if (p.icon) await grantIcon(o, p.icon);
  if (p.news)
    opNews(o, p.news === 'broadcast' ? 'kuji.big' : 'kuji.win', {
      tier,
      pool: Number(pool.id),
      seq: pool.seq,
      // 豪华池的新闻写明线（240-2）；普通池不写，和以前一样
      ...(pool.line === 'deluxe' ? { line: 'deluxe' } : {}),
    });
}

export function createKujiService(d: GameDeps) {
  async function viewOf(
    db: GameDeps['db'],
    shardId: number,
    restId: number,
    k: LineConf,
    pool: PoolRow,
    tickets: number,
    bought: number,
    coin: number,
    closedToday = false,
  ): Promise<KujiViewDto> {
    const left = await tierLeft(db, pool.id);
    // 奖品按这一池开池时的快照显示（一番赏终审 I1）
    const prizes = prizesOf(pool, k);
    const counts = await db
      .selectFrom('kuji_ticket')
      .select(['tier', sql<string>`count(*)`.as('n')])
      .where('pool_id', '=', pool.id)
      .groupBy('tier')
      .execute();
    const order = new Map(prizes.tiers.map((x, i) => [x.key, i]));
    const tiers = counts
      .map((c) => {
        const conf = prizes.tiers.find((x) => x.key === c.tier);
        return {
          key: c.tier,
          count: Number(c.n),
          left: left.get(c.tier) ?? 0,
          award: conf ? awardDto(conf.award) : {},
          icon: conf?.icon ?? null,
          big: conf?.news === 'broadcast',
        };
      })
      .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || a.key.localeCompare(b.key));
    const recent = await db
      .selectFrom('news as n')
      .leftJoin('restaurant as r', 'r.id', 'n.rest_id')
      .select(['n.created_at', 'n.params', 'r.name'])
      .where('n.shard_id', '=', pool.shard_id)
      .where('n.type', 'in', ['kuji.big', 'kuji.win'])
      // 最近的大赏按线分开（240-2）：旧新闻没有 line，算普通池
      .where((eb) =>
        pool.line === 'deluxe'
          ? eb(sql<string>`n.params->>'line'`, '=', 'deluxe')
          : eb(sql<string>`n.params->>'line'`, 'is', null),
      )
      .orderBy('n.id', 'desc')
      .limit(RECENT)
      .execute();
    return {
      line: pool.line,
      pool: {
        id: Number(pool.id),
        day: pool.day,
        seq: pool.seq,
        total: pool.total,
        left: [...left.values()].reduce((s, x) => s + x, 0),
      },
      tiers,
      theme: themeOf(pool.theme),
      closedToday,
      last: { award: awardDto(prizes.last.award), icon: prizes.last.icon ?? null },
      tickets,
      coin,
      price: k.price,
      buyLeft: Math.max(0, k.dailyBuy - bought),
      maxDraw: k.maxDraw,
      recent: recent.map((x) => ({
        at: x.created_at.toISOString(),
        restName: x.name ?? '?',
        tier: String((x.params as { tier?: string }).tier ?? ''),
      })),
    };
  }

  /** 月度主题（问题记录 274）：把当月的限定手办加进 A/B/C 和最后赏的奖品 */
  function themed(k: K, now: Date): { tiers: K['tiers']; last: K['last']; theme?: number } {
    const month = Number(gameDay(now).slice(5, 7));
    const th = d.config.bundle.kujiThemes.find((x) => x.month === month);
    if (!th) return { tiers: k.tiers, last: k.last };
    const fig = th.figures as Record<string, number | undefined>;
    const add = (award: K['last']['award'], id: number | undefined) =>
      id ? { ...award, goods: [...(award.goods ?? []), { id, num: 1 }] } : award;
    return {
      tiers: k.tiers.map((t) => ({ ...t, award: add(t.award, fig[t.key]) })),
      last: { ...k.last, award: add(k.last.award, fig.last) },
      theme: month,
    };
  }

  function themeOf(month: number | null): KujiViewDto['theme'] {
    const th = month === null ? undefined : d.config.bundle.kujiThemes.find((x) => x.month === month);
    return th ? { month: th.month, name: th.name, desc: th.desc } : null;
  }

  /** 豪华池按月轮换称号（240-2）：当月有对照就替换对应档和最后赏的称号，没有就用区服数值里的 */
  function deluxeThemed(c: LineConf, now: Date): { tiers: K['tiers']; last: K['last'] } {
    const month = gameDay(now).slice(0, 7);
    const m = d.config.bundle.kujiDeluxeMonths.find((x) => x.month === month);
    if (!m) return { tiers: c.tiers, last: c.last };
    return {
      tiers: c.tiers.map((x) => (m.icons[x.key] ? { ...x, icon: m.icons[x.key] } : x)),
      last: m.icons.last ? { ...c.last, icon: m.icons.last } : c.last,
    };
  }

  /** 当前池（按当月主题开池、每天最多 maxPools 池）；今天开满了返回空 */
  async function poolFor(
    tx: GameDeps['db'],
    shardId: number,
    k: K,
    now: Date,
    line: KujiLine,
  ): Promise<PoolRow | null> {
    // 按拿到开池锁之后的时间取主题、称号和日期：请求排队时可能跨过 0 点（backlog 一番赏、质量期 ②）。
    // 开池用 prizesAt 的结果；按 now 算的 tiers、last 只是 currentPool 的必填参数，给了 prizesAt 就不用
    if (line === 'deluxe') {
      const p = deluxeThemed(k.deluxe, now);
      return currentPool(tx, shardId, p.tiers, now, p.last, {
        maxPools: k.deluxe.maxPools,
        clock: () => d.now(),
        prizesAt: (at) => deluxeThemed(k.deluxe, at),
        line,
      });
    }
    const p = themed(k, now);
    return currentPool(tx, shardId, p.tiers, now, p.last, {
      maxPools: k.maxPools,
      theme: p.theme,
      clock: () => d.now(),
      prizesAt: (at) => themed(k, at),
    });
  }

  /** 看板显示的池：今天开满了就显示最后一池，并标明今天抽完了 */
  async function shownPool(tx: GameDeps['db'], shardId: number, k: K, now: Date, line: KujiLine) {
    const pool = await poolFor(tx, shardId, k, now, line);
    if (pool) return { pool, closedToday: false };
    const latest = await latestToday(tx, shardId, gameDay(now), line);
    if (!latest) throw new Error('kuji: no pool for shard ' + shardId);
    return { pool: latest, closedToday: true };
  }

  async function opView(o: Op, line: KujiLine): Promise<KujiViewDto> {
    const k = o.tuning.kuji;
    const { pool, closedToday } = await shownPool(o.tx, o.shardId, k, o.now, line);
    return viewOf(
      o.tx,
      o.shardId,
      o.rest.id,
      conf(k, line),
      pool,
      await countGoods(o, ticketOf(line)),
      await getDaily(o.tx, o.rest.id, buyKeyOf(line), gameDay(o.now)),
      Number(o.rest.coin),
      closedToday,
    );
  }

  async function buy(o: Op, num: number, line: KujiLine) {
    const k = conf(o.tuning.kuji, line);
    const day = gameDay(o.now);
    const bought = await getDaily(o.tx, o.rest.id, buyKeyOf(line), day);
    if (bought + num > k.dailyBuy)
      throw limitReached('kuji_buy', { max: k.dailyBuy, left: Math.max(0, k.dailyBuy - bought) });
    spendCoin(o, k.price * num, { source: 'kuji' });
    const granted = await grantGoodsOp(o, ticketOf(line), num, { source: 'kuji' });
    // 仓库放不下时整笔回滚：不能扣了钱却没给券（Review Focus 3）
    if (granted < num) throw invalidState('store_full');
    await incrementDaily(o.tx, o.rest.id, buyKeyOf(line), num, day);
    restLog(o, 'kuji.buy', { num, coin: k.price * num, ...(line === 'deluxe' ? { line } : {}) });
    return opView(o, line);
  }

  async function draw(o: Op, num: number, line: KujiLine): Promise<KujiDrawDto> {
    const k = conf(o.tuning.kuji, line);
    if (num > k.maxDraw) throw limitReached('kuji_draw', { max: k.maxDraw });
    // 加锁顺序：店（runOp）→（要开池时）区服锁 → 池行。刚被别人抽完就换下一池，同样加锁后再看状态
    let pool: PoolRow | undefined;
    for (let attempt = 0; attempt < 5 && !pool; attempt++) {
      const cur = await poolFor(o.tx, o.shardId, o.tuning.kuji, o.now, line);
      if (!cur) throw invalidState('kuji_closed');
      const locked = (await o.tx
        .selectFrom('kuji_pool')
        .select([
          'id',
          'shard_id',
          'day',
          'seq',
          'status',
          'total',
          'last_rest_id',
          'tiers',
          'last',
          'theme',
          'line',
        ])
        .where('id', '=', cur.id)
        .forUpdate()
        .executeTakeFirstOrThrow()) as PoolRow;
      if (locked.status === 'open') pool = locked;
    }
    if (!pool) throw invalidState('kuji_left', { left: 0 });
    const prizes = prizesOf(pool, k);
    const remaining = await o.tx
      .selectFrom('kuji_ticket')
      .select(['idx', 'tier'])
      .where('pool_id', '=', pool.id)
      .where('drawn_at', 'is', null)
      .orderBy('idx')
      .execute();
    if (num > remaining.length) throw invalidState('kuji_left', { left: remaining.length });
    if ((await countGoods(o, ticketOf(line))) < num) throw invalidState('kuji_ticket');
    await consumeGoods(o, ticketOf(line), num, { source: 'kuji' });
    const left = [...remaining];
    const picked: typeof remaining = [];
    for (let i = 0; i < num; i++) picked.push(left.splice(o.rng.int(left.length), 1)[0]!);
    await o.tx
      .updateTable('kuji_ticket')
      .set({ drawn_by: o.rest.id, drawn_at: o.now })
      .where('pool_id', '=', pool.id)
      .where(
        'idx',
        'in',
        picked.map((x) => x.idx),
      )
      .execute();
    const draws: KujiDrawDto['draws'] = [];
    for (const p of picked) {
      const conf = prizes.tiers.find((x) => x.key === p.tier) ?? { award: {} };
      await prize(o, p.tier, conf, pool);
      draws.push({ tier: p.tier, award: awardDto(conf.award) });
    }
    let last: KujiAwardDto | null = null;
    if (left.length === 0) {
      await prize(o, 'last', prizes.last, pool);
      last = awardDto(prizes.last.award);
      await o.tx
        .updateTable('kuji_pool')
        .set({ status: 'sold_out', closed_at: o.now, last_rest_id: o.rest.id })
        .where('id', '=', pool.id)
        .execute();
    }
    const tally: Record<string, number> = {};
    for (const p of picked) tally[p.tier] = (tally[p.tier] ?? 0) + 1;
    restLog(o, 'kuji.draw', {
      seq: pool.seq,
      num,
      tiers: tally,
      last: last !== null,
      ...(line === 'deluxe' ? { line } : {}),
    });
    // 任务和活跃（问题记录 318）：抽几张计几次；拿到最后赏另计
    await emitAction(o, 'kuji.draw', num);
    if (last !== null) await emitAction(o, 'kuji.last');
    // 新闻要等这次操作提交时才写库：把自己刚中的大赏先放进"最近的大赏"，不用刷新就能看到（backlog 一番赏）
    const view = await opView(o, line);
    const won = [
      ...picked.filter((p) => prizes.tiers.find((x) => x.key === p.tier)?.news).map((p) => p.tier),
      ...(last !== null && prizes.last.news ? ['last'] : []),
    ];
    const mine = won.reverse().map((tier) => ({ at: o.now.toISOString(), restName: o.rest.name, tier }));
    return { draws, last, view: { ...view, recent: [...mine, ...view.recent].slice(0, RECENT) } };
  }

  const op = <T>(ctx: RestCtx, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'kuji', source: 'kuji' }, fn);

  return {
    /** 看板只读（一番赏终审 I2）：不锁店；今天已有进行中的池时也不拿区服锁，只有要开池时才在短事务里拿 */
    view: async (ctx: RestCtx, line: KujiLine = 'normal'): Promise<KujiViewDto> => {
      const s = await d.shards.ensureFeature(ctx.shardId, 'kuji');
      const k = s.tuning.kuji;
      const now = d.now();
      const { pool, closedToday } = await d.db
        .transaction()
        .execute((tx) => shownPool(tx, ctx.shardId, k, now, line));
      const t = await d.db
        .selectFrom('store_item')
        .select('num')
        .where('rest_id', '=', ctx.restaurantId)
        .where('goods_id', '=', ticketOf(line))
        .executeTakeFirst();
      const bought = await getDaily(d.db, ctx.restaurantId, buyKeyOf(line), gameDay(now));
      const rest = await d.db
        .selectFrom('restaurant')
        .select('coin')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return viewOf(
        d.db,
        ctx.shardId,
        ctx.restaurantId,
        conf(k, line),
        pool,
        t?.num ?? 0,
        bought,
        Number(rest.coin),
        closedToday,
      );
    },
    buy: (ctx: RestCtx, num: number, line: KujiLine = 'normal') => op(ctx, (o) => buy(o, num, line)),
    draw: (ctx: RestCtx, num: number, line: KujiLine = 'normal') => op(ctx, (o) => draw(o, num, line)),
  };
}
export type KujiService = ReturnType<typeof createKujiService>;

import { sql } from 'kysely';
import { GOODS, type Tuning } from '@dt/config';
import { gameDay, type KujiAwardDto, type KujiDrawDto, type KujiViewDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, runOp, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { grantAward } from '../award/award';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { currentPool, tierLeft, type PoolRow } from './pool';

type K = Tuning['kuji'];
const BUY_KEY = 'kuji.buy';
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
    });
}

export function createKujiService(d: GameDeps) {
  async function viewOf(
    db: GameDeps['db'],
    shardId: number,
    restId: number,
    k: K,
    pool: PoolRow,
    tickets: number,
    bought: number,
  ): Promise<KujiViewDto> {
    const left = await tierLeft(db, pool.id);
    // 这一池实际用的档位（开池时的 tiers），奖品按当前配置里同名的档显示；找不到同名的就只显示张数
    const counts = await db
      .selectFrom('kuji_ticket')
      .select(['tier', sql<string>`count(*)`.as('n')])
      .where('pool_id', '=', pool.id)
      .groupBy('tier')
      .execute();
    const order = new Map(k.tiers.map((x, i) => [x.key, i]));
    const tiers = counts
      .map((c) => {
        const conf = k.tiers.find((x) => x.key === c.tier);
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
      .orderBy('n.created_at', 'desc')
      .orderBy('n.id', 'desc')
      .limit(RECENT)
      .execute();
    return {
      pool: {
        id: Number(pool.id),
        day: pool.day,
        seq: pool.seq,
        total: pool.total,
        left: [...left.values()].reduce((s, x) => s + x, 0),
      },
      tiers,
      last: { award: awardDto(k.last.award), icon: k.last.icon ?? null },
      tickets,
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

  async function opView(o: Op): Promise<KujiViewDto> {
    const k = o.tuning.kuji;
    const pool = await currentPool(o.tx, o.shardId, k.tiers, o.now);
    return viewOf(
      o.tx,
      o.shardId,
      o.rest.id,
      k,
      pool,
      await countGoods(o, GOODS.kujiTicket),
      await getDaily(o.tx, o.rest.id, BUY_KEY, gameDay(o.now)),
    );
  }

  async function buy(o: Op, num: number) {
    const k = o.tuning.kuji;
    const day = gameDay(o.now);
    const bought = await getDaily(o.tx, o.rest.id, BUY_KEY, day);
    if (bought + num > k.dailyBuy)
      throw limitReached('kuji_buy', { max: k.dailyBuy, left: Math.max(0, k.dailyBuy - bought) });
    spendCoin(o, k.price * num, { source: 'kuji' });
    const granted = await grantGoodsOp(o, GOODS.kujiTicket, num, { source: 'kuji' });
    // 仓库放不下时整笔回滚：不能扣了钱却没给券（Review Focus 3）
    if (granted < num) throw invalidState('store_full');
    await incrementDaily(o.tx, o.rest.id, BUY_KEY, num, day);
    restLog(o, 'kuji.buy', { num, coin: k.price * num });
    return opView(o);
  }

  async function draw(o: Op, num: number): Promise<KujiDrawDto> {
    const k = o.tuning.kuji;
    if (num > k.maxDraw) throw limitReached('kuji_draw', { max: k.maxDraw });
    let pool = await currentPool(o.tx, o.shardId, k.tiers, o.now);
    // 加锁顺序：店（runOp）→ 池
    pool = (await o.tx
      .selectFrom('kuji_pool')
      .select(['id', 'shard_id', 'day', 'seq', 'status', 'total', 'last_rest_id'])
      .where('id', '=', pool.id)
      .forUpdate()
      .executeTakeFirstOrThrow()) as PoolRow;
    if (pool.status !== 'open') pool = await currentPool(o.tx, o.shardId, k.tiers, o.now); // 刚被别人抽完：换下一池
    const remaining = await o.tx
      .selectFrom('kuji_ticket')
      .select(['idx', 'tier'])
      .where('pool_id', '=', pool.id)
      .where('drawn_at', 'is', null)
      .orderBy('idx')
      .execute();
    if (num > remaining.length) throw invalidState('kuji_left', { left: remaining.length });
    if ((await countGoods(o, GOODS.kujiTicket)) < num) throw invalidState('kuji_ticket');
    await consumeGoods(o, GOODS.kujiTicket, num, { source: 'kuji' });
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
      const conf = k.tiers.find((x) => x.key === p.tier) ?? { award: {} };
      await prize(o, p.tier, conf, pool);
      draws.push({ tier: p.tier, award: awardDto(conf.award) });
    }
    let last: KujiAwardDto | null = null;
    if (left.length === 0) {
      await prize(o, 'last', k.last, pool);
      last = awardDto(k.last.award);
      await o.tx
        .updateTable('kuji_pool')
        .set({ status: 'sold_out', closed_at: o.now, last_rest_id: o.rest.id })
        .where('id', '=', pool.id)
        .execute();
    }
    const tally: Record<string, number> = {};
    for (const p of picked) tally[p.tier] = (tally[p.tier] ?? 0) + 1;
    restLog(o, 'kuji.draw', { seq: pool.seq, num, tiers: tally, last: last !== null });
    return { draws, last, view: await opView(o) };
  }

  const op = <T>(ctx: RestCtx, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'kuji', source: 'kuji' }, fn);

  return {
    view: async (ctx: RestCtx) => (await op(ctx, opView)).data,
    buy: (ctx: RestCtx, num: number) => op(ctx, (o) => buy(o, num)),
    draw: (ctx: RestCtx, num: number) => op(ctx, (o) => draw(o, num)),
  };
}
export type KujiService = ReturnType<typeof createKujiService>;

import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import { gameDay, type Rng } from '@dt/shared';
import { requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { gainRenown, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { hasValidHonor } from '../store/goods';
import { KEY, requireOpen } from './common';
import { publicTarget, rollOrder, type TakeawayTuning } from './rules';

/** 全部食谱 id（升序，同样的随机数抽到同一道） */
function cookbookIds(config: GameConfig): number[] {
  return [...config.cookbooks.keys()].sort((a, b) => a - b);
}

/** 生成 n 张单写入；owner 为空是公共单 */
async function insertOrders(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  owner: number | null,
  n: number,
  now: Date,
  rng: Rng,
  t: TakeawayTuning,
): Promise<void> {
  if (n <= 0) return;
  const ids = cookbookIds(config);
  const rows = Array.from({ length: n }, () => {
    const r = rollOrder(rng, ids, t);
    return {
      shard_id: shardId,
      owner_rest_id: owner,
      cookbook_id: r.cookbookId,
      grade: r.grade,
      need_minutes: r.needMinutes,
      need_renown: r.needRenown,
      created_at: now,
      expires_at: new Date(now.getTime() + r.expireMinutes * 60_000),
    };
  });
  await db.insertInto('takeaway_order').values(rows).execute();
}

/** 整点补公共单（设计文档 §3.2）：补到目标数；随机数顺序 目标数 → 每张单 */
export async function fillPublic(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
  rng: Rng,
  t: TakeawayTuning,
): Promise<number> {
  const open = await db
    .selectFrom('restaurant')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('shard_id', '=', shardId)
    .where('state', '=', 1)
    .where('npc', '=', false)
    .executeTakeFirstOrThrow();
  const cur = await db
    .selectFrom('takeaway_order')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('shard_id', '=', shardId)
    .where('owner_rest_id', 'is', null)
    .where('state', '=', 1)
    .where('expires_at', '>', now)
    .executeTakeFirstOrThrow();
  const n = publicTarget(Number(open.n), rng.int(t.publicRand), t) - Number(cur.n);
  await insertOrders(db, config, shardId, null, n, now, rng, t);
  return Math.max(0, n);
}

/** 清理（设计文档裁定 15）：过期超过 keepOpenDays 的未接单、keepDoneDays 前完成的单（配送级联删除）；配送中的不动 */
export async function cleanupOrders(
  db: Kysely<DB>,
  shardId: number,
  now: Date,
  t: TakeawayTuning,
): Promise<number> {
  const openBefore = new Date(now.getTime() - t.keepOpenDays * 86_400_000);
  const doneBefore = new Date(now.getTime() - t.keepDoneDays * 86_400_000);
  const r = await db
    .deleteFrom('takeaway_order')
    .where('shard_id', '=', shardId)
    .where((eb) =>
      eb.or([
        eb.and([eb('state', '=', 1), eb('expires_at', '<', openBefore)]),
        eb.and([eb('state', '=', 3), eb('created_at', '<', doneBefore)]),
      ]),
    )
    .executeTakeFirst();
  return Number(r.numDeletedRows);
}

/** 私人刷新（设计文档裁定 4）：要有效的商店工作证；费用 refreshCoin × (今天已刷新次数 + 1)；送声望 */
export async function refreshPrivate(o: Op): Promise<{ created: number }> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  if (!(await hasValidHonor(o, GOODS.shopJobHonor))) throw requirement('job_honor');
  const day = gameDay(o.now);
  const times = await getDaily(o.tx, o.rest.id, KEY.refresh, day);
  spendCoin(o, t.refreshCoin * (times + 1));
  gainRenown(o, t.refreshRenown);
  await insertOrders(o.tx, o.config, o.shardId, o.rest.id, t.refreshNum, o.now, o.rng, t);
  await incrementDaily(o.tx, o.rest.id, KEY.refresh, 1, day);
  restLog(o, 'takeaway.refresh', { times: times + 1 });
  return { created: t.refreshNum };
}

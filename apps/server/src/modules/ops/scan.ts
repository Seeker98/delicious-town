import { SPONSOR_HATS } from '@dt/config';
import { featureAvailable } from '../../core/features';
import type { Game } from '../../game';
import type { JobLogger } from '../../worker/scheduler';
import { hatDisplayName } from '../equip/hats';
import { scanInvites } from '../invite/scan';
import { sendMail } from '../mail/send';

/**
 * 六星换铉（设计 裁定 25）：每顶命名玉帽只换一次，换过的记在 xuan_sent_at。
 * 每顶单独一个事务，一顶出错不影响其他，下一分钟会再扫到
 */
export async function scanHats(
  game: Game,
  log: JobLogger,
  shardId: number,
): Promise<{ sent: number; failed: number }> {
  const db = game.app.db;
  const rows = await db
    .selectFrom('equip as e')
    .innerJoin('restaurant as r', 'r.id', 'e.rest_id')
    .select(['e.id', 'e.rest_id', 'e.custom_name'])
    .where('r.shard_id', '=', shardId)
    .where('r.star_level', '>=', 6)
    .where('e.goods_id', '=', SPONSOR_HATS.jade)
    .where('e.custom_name', 'is not', null)
    .where('e.xuan_sent_at', 'is', null)
    .orderBy('e.id')
    .limit(500)
    .execute();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const name = row.custom_name!;
    try {
      const done = await db.transaction().execute(async (tx) => {
        const hit = await tx
          .updateTable('equip')
          .set({ xuan_sent_at: new Date() })
          .where('id', '=', row.id)
          .where('xuan_sent_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!hit) return false;
        await sendMail(tx, {
          scope: 'rest',
          shardId,
          restId: row.rest_id,
          minLevel: null,
          title: '赞助帽子升级',
          body: `餐厅升到六星，${hatDisplayName('jade', name)}升级为${hatDisplayName('xuan', name)}。`,
          tpl: { key: 'hat.upgrade', params: { name } },
          items: { hats: [{ tier: 'xuan', name }] },
          source: 'hat',
          actorAccountId: null,
        });
        return true;
      });
      if (done) sent++;
    } catch (err) {
      failed++;
      log.error({ err, shardId, equipId: row.id }, 'ops-scan hat failed');
    }
  }
  return { sent, failed };
}

/** worker 每分钟一次：遍历开放区服跑各项扫描（设计 §7）：六星换铉；区服开着邀请时再跑邀请扫描 */
export async function runOpsScan(
  game: Game,
  log: JobLogger,
  /** 只扫这些区服；不传就是全部开放的区服（测试里用，免得扫到别的测试正在用的区服） */
  opts: { shardIds?: number[] } = {},
): Promise<void> {
  const shards = await game.app.db
    .selectFrom('shard')
    .select('id')
    .where('status', '=', 'open')
    .$if(opts.shardIds !== undefined, (q) => q.where('id', 'in', opts.shardIds!))
    .orderBy('id')
    .execute();
  for (const { id } of shards) {
    // 一个区服出错只跳过它，不影响同一轮后面的区服（backlog 邀请）
    try {
      await scanHats(game, log, id);
      if (featureAvailable(await game.shards.settings(id), 'invite')) await scanInvites(game, log, id);
    } catch (err) {
      log.error({ err, shardId: id }, 'ops-scan shard failed');
    }
  }
}

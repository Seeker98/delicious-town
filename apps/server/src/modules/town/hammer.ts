import { GOODS } from '@dt/config';
import { gameParts, pickWeighted, type HammerResultDto } from '@dt/shared';
import { invalidState, notEnough } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { spendCoin, spendDiamond } from '../../core/resources';
import { grantGoodsOp, hasValidHonor } from '../store/goods';
import { hammerPool, type HammerPick } from '../world/rules';
import { cooldownError, setTownRest, townRest } from './common';

/**
 * 雷神锤（设计文档 §3.5、裁定 15~18）。调用前已确保 world_state 存在；
 * 在事务里锁住本区服 world_state 行再检查 90 秒间隔，两人同时使用只有一个成功
 */
export async function useHammer(o: Op, pick: HammerPick): Promise<HammerResultDto> {
  const h = o.tuning.town.hammer;
  if (!(await hasValidHonor(o, GOODS.thorHammer))) throw notEnough('goods', 1, 0, GOODS.thorHammer);
  const tr = await townRest(o);
  const cooldownMs = h.cooldownHours * 3600_000;
  if (tr.hammer_at) {
    const until = new Date(tr.hammer_at.getTime() + cooldownMs);
    if (until > o.now) throw cooldownError('hammer', until, o.now);
  }
  const ws = await o.tx
    .selectFrom('world_state')
    .select(['weather_id', 'weather_changed_at'])
    .where('shard_id', '=', o.shardId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (ws.weather_changed_at) {
    const until = new Date(ws.weather_changed_at.getTime() + h.gapSec * 1000);
    if (until > o.now) throw cooldownError('weather_gap', until, o.now);
  }
  const pool = hammerPool(o.config, gameParts(o.now).hour, o.tuning.world, pick, ws.weather_id);
  if (pool.total <= 0) throw invalidState('no_weather');
  if (pick.mode === 'coin') spendCoin(o, h.coin);
  else spendDiamond(o, h.diamond);
  const to = pickWeighted(pool, o.rng);
  await o.tx
    .updateTable('world_state')
    .set({ weather_id: to.id, weather_changed_at: o.now, updated_at: o.now })
    .where('shard_id', '=', o.shardId)
    .execute();
  const gift = pick.mode === 'coin' ? GOODS.missileBurst : GOODS.luckyCookie;
  await grantGoodsOp(o, gift, 1);
  await setTownRest(o, { hammer_at: o.now });
  opNews(o, 'weather.change', { from: ws.weather_id, to: to.id, by: o.rest.id });
  restLog(o, 'town.hammer', { mode: pick.mode, from: ws.weather_id, to: to.id });
  return {
    from: ws.weather_id,
    to: to.id,
    gift: { goodsId: gift, num: 1 },
    cooldownUntil: new Date(o.now.getTime() + cooldownMs).toISOString(),
  };
}

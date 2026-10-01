import { GOODS } from '@dt/config';
import { gameDay, type ManualStockDto } from '@dt/shared';
import { requirement } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainRenown, spendCoin } from '../../core/resources';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { hasValidHonor } from '../store/goods';
import { manualCost, manualRenown, rollManual } from './rules';

/**
 * 菜场工作证手动进货（设计文档 §2.5）：扣费、给声望，把自己上一批手动货下架，
 * 在日常货架挂 manualKinds 种、每种 manualStock 份的新货（日常货架整点刷新时一起下架）
 */
export async function manualStock(o: Op): Promise<ManualStockDto> {
  const t = o.tuning.market;
  if (!(await hasValidHonor(o, GOODS.marketJobHonor)))
    throw requirement('job_honor', { goodsId: GOODS.marketJobHonor });
  const day = gameDay(o.now);
  const today = await getDaily(o.tx, o.rest.id, 'market.manual', day);
  const cost = manualCost(today, t);
  spendCoin(o, cost);
  const renown = manualRenown(today, cost);
  gainRenown(o, renown);
  await incrementDaily(o.tx, o.rest.id, 'market.manual', 1, day);
  const foods = rollManual(o.config, t, o.rng);
  await o.tx
    .deleteFrom('market_item')
    .where('shard_id', '=', o.shardId)
    .where('owner_rest_id', '=', o.rest.id)
    .execute();
  if (foods.length > 0) {
    await o.tx
      .insertInto('market_item')
      .values(
        foods.map((id) => ({
          shard_id: o.shardId,
          shelf: 0,
          period: `manual:${o.now.toISOString()}`,
          foods_id: id,
          stock: t.manualStock,
          hot: false,
          opened_at: o.now,
          owner_rest_id: o.rest.id,
        })),
      )
      .execute();
  }
  opNews(o, 'market.manual', { foods });
  restLog(o, 'market.manual', { cost, renown, foods });
  return { foods, cost, renown };
}

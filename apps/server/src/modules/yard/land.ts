import { limitReached } from '../../core/errors';
import type { Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { landPrice } from './rules';

/** 开垦下一块地（规格书 08 §8.1）：第 n 块花 landBaseCoin × 2ⁿ */
export async function expandLand(o: Op): Promise<{ no: number; coin: number }> {
  const t = o.tuning.yard;
  const r = await o.tx
    .selectFrom('yard_land')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  const have = Number(r.n);
  if (have >= t.maxLands) throw limitReached('lands', { max: t.maxLands });
  const no = have + 1;
  const coin = landPrice(no, t);
  spendCoin(o, coin);
  await o.tx.insertInto('yard_land').values({ rest_id: o.rest.id, no }).execute();
  return { no, coin };
}

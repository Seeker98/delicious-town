import { GOODS } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  pickWeighted,
  type NpcKey,
  type TalkLine,
  type TalkResultDto,
  type TownRewardDto,
} from '@dt/shared';
import { invalidState } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import { addSeeds } from '../temple/common';
import { setTownRest, townRest } from './common';
import { pickBigEaterLevel, rollRange } from './rules';

/** NPC 对话（设计文档 §3.3、裁定 6）：每个 NPC 每天一次 */
export async function talk(o: Op, npc: NpcKey): Promise<TalkResultDto> {
  const t = o.tuning.town.npc;
  if ((await incrementDaily(o.tx, o.rest.id, `town.talk.${npc}`, 1, gameDay(o.now))) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'talk' });
  const rewards: TownRewardDto[] = [];
  // 台词照原版 NPCTools，只返回代码，前端按语言显示（问题记录 272）
  let line: TalkLine = npc;
  if (npc === 'bigEater') {
    const pool = o.config.foodPools.get(pickBigEaterLevel(t.bigEaterLevelWeights, o.rng));
    if (!pool || pool.total <= 0) throw invalidState('no_foods');
    const food = pickWeighted(pool, o.rng);
    const num = rollRange(t.bigEaterNum, o.rng);
    // 奖励按实际到账显示：超过持有上限被丢弃的部分不算（PR26 遗留）
    const got = await addFoods(o, food.id, num);
    rewards.push({ kind: 'foods', id: food.id, num: got.toCupboard + got.toFridge });
    const seed = pickWeighted(o.config.seedPool, o.rng);
    await addSeeds(o, seed.id, 1);
    rewards.push({ kind: 'seed', id: seed.id, num: 1 });
    if (!(await townRest(o)).big_eater_gift) {
      const gift = await grantGoodsOp(o, GOODS.mysteryFoodExchange, 1);
      await setTownRest(o, { big_eater_gift: true });
      rewards.push({ kind: 'goods', id: GOODS.mysteryFoodExchange, num: gift });
      line = 'bigEaterFirst';
    }
  } else {
    const goodsId = npc === 'wenjie' ? GOODS.mysteryTicket : GOODS.horn;
    const num = rollRange(npc === 'wenjie' ? t.wenjieNum : t.bro13Num, o.rng);
    rewards.push({ kind: 'goods', id: goodsId, num: await grantGoodsOp(o, goodsId, num) });
  }
  restLog(o, 'town.talk', { npc, rewards });
  return { npc, talk: line, rewards };
}

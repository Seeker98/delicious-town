import { GOODS } from '@dt/config';
import type { TestGame } from '../../../test/game';
import { Tally, parallel, rate, shops, times } from './harness';

/** 一番赏（普通线）：一家店把整池抽完，看第 1 张、前 10 张各档的比例；期望 = 档的张数 ÷ 总张数 */
export async function kujiOdds(t: TestGame): Promise<void> {
  const k = t.deps.config.tuning.kuji;
  const total = k.tiers.reduce((a, x) => a + x.count, 0);
  const first = new Tally<string>();
  const firstTen = new Tally<string>();
  let pools = 0;
  let lastOk = 0;
  const n = times(400);
  // 每池一个新区服（一个区服一天最多开 maxPools 池）
  await parallel(8, n, async () => {
    const [ctx] = await shops(t, 1, { goods: { [GOODS.kujiTicket]: 10_000 } }, { features: { kuji: true } });
    const order: string[] = [];
    let last = false;
    while (order.length < total) {
      const d = (await t.game.kuji.draw(ctx!, Math.min(k.maxDraw, total - order.length))).data;
      order.push(...d.draws.map((x) => x.tier));
      last ||= d.last !== null;
    }
    pools++;
    if (last) lastOk++;
    first.add(order[0]!);
    for (const tier of order.slice(0, 10)) firstTen.add(tier);
  });
  for (const x of k.tiers) {
    rate('一番赏', `第 1 张是 ${x.key} 赏`, first.get(x.key), pools, x.count / total);
    rate('一番赏', `前 10 张里 ${x.key} 赏的比例`, firstTen.get(x.key), firstTen.n, x.count / total);
  }
  rate('一番赏', '抽完最后一张给最后赏', lastOk, pools, 1);
}

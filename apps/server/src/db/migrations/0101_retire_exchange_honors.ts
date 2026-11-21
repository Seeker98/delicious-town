import { sql, type Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 镇长碎片兑换只留厨神附体、厨塔声望商店的 3 座雕像下架（用户 2026-11-21）：
 * - 持有的原路退回：碎片兑换的勋章按兑换价退五级残卷碎片（只退兑换记录 town_exchange_use 里换过的件数，
 *   别的途径拿到的不退），走系统邮件附件；雕像只能在声望商店买，持有一座退 3000 声望，直接加到店上并记流水。
 *   一家店一封邮件写明退了什么；按来源去重，重跑不会重复退
 * - 然后持有的、正在生效的加成来源都清掉，加成缓存标脏（dropRetiredGoods）
 * down 什么也不做：下架的道具回不来
 */
const SOURCE = 'retire.refund.1121';
/** 五级残卷碎片 */
const FRAGMENT5 = 10805;

/** 碎片兑换的勋章：道具 → 兑换项编号、每件花的五级残卷碎片 */
export const CHIP_HONORS: Record<number, { exchangeId: number; fragments: number }> = {
  61701: { exchangeId: 54, fragments: 50 }, // 名师
  61502: { exchangeId: 55, fragments: 50 }, // 中华金厨奖
  61702: { exchangeId: 58, fragments: 50 }, // 百世之师
  61703: { exchangeId: 59, fragments: 50 }, // 教书匠
  61403: { exchangeId: 60, fragments: 80 }, // 秘制调味料
  61427: { exchangeId: 66, fragments: 50 }, // 星神之泪
};
/** 声望商店的雕像：恰克摩尔、史前怪石、破，每座 3000 声望 */
export const STATUES: Record<number, number> = { 61602: 3000, 61605: 3000, 61606: 3000 };
export const RETIRED_GOODS = [...Object.keys(CHIP_HONORS), ...Object.keys(STATUES)].map(Number);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function refund(db: Kysely<any>, restIds?: number[]): Promise<number> {
  const only = restIds ? sql` and r.id in (${sql.join(restIds)})` : sql``;
  const { rows } = await sql<{
    rest_id: number;
    shard_id: number;
    goods_id: number;
    num: number;
    times: number | null;
  }>`
    select s.rest_id, r.shard_id, s.goods_id, s.num,
      (select u.times from town_exchange_use u where u.rest_id = s.rest_id and u.exchange_id = case s.goods_id
        ${sql.join(
          Object.entries(CHIP_HONORS).map(([g, c]) => sql`when ${Number(g)}::int then ${c.exchangeId}::int`),
          sql` `,
        )} end) as times
    from store_item s join restaurant r on r.id = s.rest_id
    where not r.npc and s.num > 0 and (s.expires_at is null or s.expires_at > now())
      and s.goods_id in (${sql.join(RETIRED_GOODS)})${only}
      and not exists (select 1 from mail m where m.rest_id = s.rest_id and m.source = ${SOURCE})
    order by s.rest_id, s.goods_id`.execute(db);
  const per = new Map<number, { shard: number; fragments: number; renown: number; goods: number[] }>();
  for (const x of rows) {
    const chip = CHIP_HONORS[x.goods_id];
    const n = chip ? Math.min(x.num, x.times ?? 0) : x.num;
    if (n <= 0) continue;
    const p = per.get(x.rest_id) ?? { shard: x.shard_id, fragments: 0, renown: 0, goods: [] };
    if (chip) p.fragments += n * chip.fragments;
    else p.renown += n * STATUES[x.goods_id]!;
    p.goods.push(x.goods_id);
    per.set(x.rest_id, p);
  }
  for (const [restId, p] of per) {
    if (p.renown > 0) {
      await sql`update restaurant set renown = renown + ${p.renown} where id = ${restId}`.execute(db);
      await sql`insert into ledger (rest_id, kind, item_id, delta, source)
        values (${restId}, 'renown', null, ${p.renown}, ${SOURCE})`.execute(db);
    }
    const items = p.fragments > 0 ? JSON.stringify({ goods: [{ id: FRAGMENT5, num: p.fragments }] }) : null;
    await sql`insert into mail (scope, shard_id, rest_id, min_level, title, body, tpl, tpl_params, items, source, actor_account_id)
      values ('rest', ${p.shard}, ${restId}, null, '道具下架退还',
        ${`你持有的道具下架了, 原路退还：${p.fragments > 0 ? `五级残卷碎片 ${p.fragments} 张 (见附件)` : ''}${p.fragments > 0 && p.renown > 0 ? '、' : ''}${p.renown > 0 ? `声望 ${p.renown} (已加到餐厅)` : ''}。`},
        'retire.refund', ${JSON.stringify({ goods: p.goods, fragments: p.fragments, renown: p.renown })}::jsonb,
        ${items}::jsonb, ${SOURCE}, null)`.execute(db);
  }
  return per.size;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await refund(db);
  await dropRetiredGoods(db, RETIRED_GOODS);
}

export async function down(): Promise<void> {
  // 下架的道具回不来
}

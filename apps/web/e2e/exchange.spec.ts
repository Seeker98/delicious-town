import pg from 'pg';
import { closeAnnouncements, expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/**
 * 交易所（156-1）：卖方挂单 → 买方点盘口吃单 → 卖方从交易所账户取出银币。
 * 只改本用例新注册的两个号（等级、注册时间、橱柜里的一种稀有食材）；结束时删掉它们的挂单、成交、账户和当天参考价
 */
test('交易所：挂卖单、吃单、取出', async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await closeAnnouncements(a);
  await closeAnnouncements(b);
  const A = await registerAndOpen(a, request);
  const B = await registerAndOpen(b, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const restIds: number[] = [];
  let foodsId = 0;
  let shardId = 0;
  try {
    for (const u of [A.username, B.username]) {
      const r = await client.query<{ id: number; shard_id: number }>(
        `update restaurant set level = 30
           where account_id = (select id from account where lower(username) = lower($1))
         returning id, shard_id`,
        [u],
      );
      restIds.push(r.rows[0]!.id);
      shardId = r.rows[0]!.shard_id;
      await client.query(
        `update account set created_at = now() - interval '30 days' where lower(username) = lower($1)`,
        [u],
      );
    }
    // 两个号来自同一台机器会共用 IP，被标成可疑成交、所得冻结（156-2）：把卖方号自己的登录记录改成另一个 IP
    await client.query(
      `update login_trace set ip = '10.123.0.1'
         where account_id = (select id from account where lower(username) = lower($1))`,
      [A.username],
    );
    const foods = (await (await a.request.get('/api/v1/exchange/foods')).json()) as {
      data: Array<{ foodsId: number; ref: number }>;
    };
    const pick = foods.data[0]!;
    foodsId = pick.foodsId;
    await client.query(
      `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 5)
         on conflict (rest_id, foods_id) do update set num = cupboard_food.num + 5`,
      [restIds[0], foodsId],
    );

    // 卖方挂 2 个
    await a.goto('/exchange');
    await a.getByTestId(`ex-food-${foodsId}`).click();
    await a.getByTestId('ex-side-sell').click();
    await a.getByTestId('ex-price').fill(String(pick.ref));
    await a.getByTestId('ex-qty').fill('2');
    await a.getByTestId('ex-submit').click();
    await expect(a.getByText('已挂单')).toBeVisible();

    // 买方点盘口的卖价吃单
    await b.goto('/exchange');
    await b.getByTestId(`ex-food-${foodsId}`).click();
    await b.getByTestId(`ex-ask-${pick.ref}`).click();
    await b.getByTestId('ex-qty').fill('2');
    await b.getByTestId('ex-submit').click();
    await expect(b.getByText('已成交 2 个')).toBeVisible();

    // 卖方的所得在交易所账户里，取出
    await a.reload();
    await expect(a.getByTestId('ex-wallet')).not.toContainText('银币 0');
    await a.getByTestId('ex-withdraw').click();
    await expect(a.getByText('已取出')).toBeVisible();
    await expect(a.getByTestId('ex-wallet')).toContainText('银币 0');
  } finally {
    if (restIds.length > 0) {
      await client.query(
        // 只删两边都是本用例的号的成交：和别人成交的记录不动（e2e 只动自己的数据）
        'delete from exchange_trade where buyer_rest_id = any($1) and seller_rest_id = any($1)',
        [restIds],
      );
      await client.query('delete from exchange_order where rest_id = any($1)', [restIds]);
      await client.query('delete from exchange_wallet where rest_id = any($1)', [restIds]);
      await client.query('delete from exchange_wallet_food where rest_id = any($1)', [restIds]);
      if (foodsId)
        await client.query(
          `delete from exchange_ref r where r.shard_id = $1 and r.foods_id = $2
             and not exists (select 1 from exchange_trade t where t.shard_id = r.shard_id and t.foods_id = r.foods_id)`,
          [shardId, foodsId],
        );
    }
    await client.end();
    await ctxA.close();
    await ctxB.close();
  }
});

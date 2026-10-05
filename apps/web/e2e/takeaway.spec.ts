import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('外卖：外卖券开通 → 私人刷新 → 接单 → 无人机送达', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number; shardId: number };
  };
  const { id: restId, shardId } = overview.data;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 2 星、声望和银币够开通和刷新、钻石够一次无人机
    await client.query(
      `update restaurant set star_level = 2, renown = 1000, coin = 2000000, diamond = 20 where id = $1`,
      [restId],
    );
    // 外卖券、商店工作证（勋章不带有效期即长期有效）
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 10302, 1), ($1, 60402, 1)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [restId],
    );
    // 学会南煎丸子（存储位 889，品级 1；重新编号后存储位不等于编号），备好猪肉、鸡蛋、香葱
    await client.query(
      `update restaurant_cookbooks set levels = set_byte(levels, 889, 1) where rest_id = $1`,
      [restId],
    );
    await client.query(
      `insert into cupboard_food (rest_id, foods_id, num) values ($1, 1007, 5), ($1, 1010, 5), ($1, 1018, 5)
       on conflict (rest_id, foods_id) do update set num = excluded.num`,
      [restId],
    );
    // 一张自己的私人单：南煎丸子、普通。开发环境的时钟可能被调过（Redis 里的偏移），
    // 所以按服务器时间算过期时间，不用数据库的 now()
    const serverNow = (
      (await (await page.request.get('/api/v1/takeaway')).json()) as { data: { now: string } }
    ).data.now;
    const { rows } = await client.query<{ id: number }>(
      `insert into takeaway_order (shard_id, owner_rest_id, cookbook_id, grade, need_minutes, need_renown, created_at, expires_at)
       values ($1, $2, 106001, 1, 30, 3, $3::timestamptz, $3::timestamptz + interval '2 hours') returning id`,
      [shardId, restId, serverNow],
    );
    const orderId = rows[0]!.id;

    await page.goto('/takeaway');
    await page.getByTestId('open-ticket').click();
    await expect(page.getByTestId('tab-orders')).toBeVisible();

    await page.getByTestId('refresh').click();
    await expect(page.locator('[data-testid^="order-"]').filter({ hasText: '私人' })).toHaveCount(16);

    const delivered = page.waitForResponse((r) => r.url().includes('/api/v1/takeaway/deliver'));
    await page.getByTestId(`take-${orderId}`).click();
    expect((await delivered).ok()).toBe(true);
    await page.getByTestId('tab-deliveries').click();
    await expect(page.getByTestId('tab-deliveries')).toHaveText('配送中（1）');
    await page.locator('[data-testid^="drone-"]').first().click();
    await expect(page.getByTestId('result-head')).toHaveText('无人机送到了');
    await expect(page.getByTestId('tab-deliveries')).toHaveText('配送中（0）');
  } finally {
    await client.end();
  }
});

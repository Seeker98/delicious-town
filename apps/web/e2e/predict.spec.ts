import pg from 'pg';
import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/**
 * 事件预测（238-1）：管理员出题 → 玩家买"是" → 管理员判定为是 → 结算任务发银币。
 * 只改本用例新注册的号（角色、等级、注册时间）和自己建的事件；结束时删掉事件（持仓、成交级联）
 */
test('事件预测：出题、买入、判定、结算到账', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  let eventId: number | null = null;
  try {
    await client.query(
      `update account set role = 'admin', created_at = now() - interval '30 days' where lower(username) = lower($1)`,
      [username],
    );
    await client.query(
      `update restaurant set level = 30, coin = 1000000 where account_id = (select id from account where lower(username) = lower($1))`,
      [username],
    );
    const overview = async () =>
      (
        (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
          data: { shardId: number; coin: number };
        }
      ).data;
    const me = await overview();
    // 游戏时钟可能被别的用例拨快过：截止时间按服务器时钟定
    const tick = await page.request.post('/api/v1/test/tick', { data: { minutes: 0, shardIds: [] } });
    const now = new Date(((await tick.json()) as { data: { now: string } }).data.now).getTime();
    const created = await page.request.post('/api/v1/admin/predict', {
      data: {
        shardId: me.shardId,
        title: 'e2e 预测',
        closeAt: new Date(now + 3_600_000).toISOString(),
        p0: 50,
      },
    });
    expect(created.ok()).toBe(true);
    eventId = ((await created.json()) as { data: { id: number } }).data.id;
    // 出题人不能交易自己出的题（backlog 238-1）：当成别的管理员出的，本号再来买
    await client.query('update predict_event set created_by = null where id = $1', [eventId]);

    await page.goto('/predict');
    await page.getByTestId(`pd-event-${eventId}`).click();
    await page.getByTestId('pd-qty').fill('10');
    await page.getByTestId('pd-submit').click();
    await expect(page.getByText('买入是 10 份')).toBeVisible();
    const afterBuy = (await overview()).coin;
    expect(afterBuy).toBeLessThan(1_000_000);

    const resolved = await page.request.post(`/api/v1/admin/predict/${eventId}/resolve`, {
      data: { outcome: true },
    });
    expect(resolved.ok()).toBe(true);
    // 推进 1 分钟跑结算任务；同一分钟可能碰上营业结算、或开发 worker 先抢到结算任务，
    // 所以不比银币总数，轮询这家店的结算日志：这一局得到 10 份 × 1,000
    await page.request.post('/api/v1/test/tick', { data: { minutes: 1, shardIds: [me.shardId] } });
    await expect
      .poll(
        async () =>
          (
            await client.query<{ coin: number }>(
              `select (params->>'coin')::int as coin from rest_log
                 where type = 'predict.settle' and params->>'title' = 'e2e 预测'
                   and rest_id = (select id from restaurant where account_id = (select id from account where lower(username) = lower($1)))`,
              [username],
            )
          ).rows[0]?.coin,
        { timeout: 15_000 },
      )
      .toBe(10_000);
  } finally {
    if (eventId !== null) await client.query('delete from predict_event where id = $1', [eventId]);
    await client.end();
  }
});

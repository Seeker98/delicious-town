import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例新注册的账号和自己建的活动；结束时删掉活动行（连同计数和领奖记录，外键级联） */
test('后台建签到活动 → 玩家签到后在活动页领奖，银币到账', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  let activityId: number | null = null;
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
    const overview = async () =>
      (
        (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
          data: { id: number; shardId: number; coin: number };
        }
      ).data;
    const before = await overview();
    // dev 的游戏时钟可能被别的用例拨快过，活动时间按服务器时钟定（tick 0 分钟、不跑任务，只读时间）
    const tick = await page.request.post('/api/v1/test/tick', { data: { minutes: 0, shardIds: [] } });
    const now = new Date(((await tick.json()) as { data: { now: string } }).data.now).getTime();
    const created = await page.request.post('/api/v1/admin/activities', {
      data: {
        shardId: before.shardId,
        kind: 'goals',
        title: 'e2e 签到活动',
        body: '端到端测试',
        startsAt: new Date(now - 60_000).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
        minLevel: 1,
        def: { goals: [{ key: 'signin', target: 1, award: { coin: 4321 } }] },
      },
    });
    expect(created.ok()).toBe(true);
    activityId = ((await created.json()) as { data: { id: number } }).data.id;
    expect((await page.request.post('/api/v1/task/signin', { data: {} })).ok()).toBe(true);

    await page.goto('/activities');
    const card = page.getByTestId(`activity-${activityId}`);
    await expect(card).toContainText('e2e 签到活动');
    await card.getByTestId(`claim-${activityId}-g0`).click();
    await expect(card.getByText('已领')).toBeVisible();
    expect((await overview()).coin).toBe(before.coin + 4321);
  } finally {
    if (activityId !== null) await client.query('delete from activity where id = $1', [activityId]);
    await client.end();
  }
});

import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例新注册的账号和店：把自己设为管理员，给自己这家店发单店邮件 */
test('后台发单店邮件 → 玩家在邮箱领取，银币到账', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }
  const overview = async () =>
    (
      (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
        data: { id: number; shardId: number; coin: number };
      }
    ).data;
  const before = await overview();
  const sent = await page.request.post('/api/v1/admin/mails', {
    data: {
      scope: 'rest',
      shardId: before.shardId,
      restId: before.id,
      title: 'e2e 测试邮件',
      body: '端到端测试',
      items: { coin: 1234 },
    },
  });
  expect(sent.ok()).toBe(true);

  await page.goto('/mail');
  await expect(page.getByText('e2e 测试邮件')).toBeVisible();
  await expect(page.getByTestId('mail-link')).toContainText('1');
  await page.locator('[data-testid^="mail-claim-"]').first().click();
  await expect(page.locator('[data-testid^="mail-delete-"]').first()).toBeVisible();
  expect((await overview()).coin).toBe(before.coin + 1234);
});

import { closeAnnouncements, expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例新注册的账号：自己设为管理员，建一个只给自己用的码 */
test('后台建兑换码 → 玩家在邮箱页兑换；带邀请链接注册的新号邮箱里有新手礼包', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(150_000);
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }
  const code = `E2E${Date.now().toString(36).toUpperCase()}`.slice(0, 16);
  const made = await page.request.post('/api/v1/admin/codes', {
    data: { code, maxUses: 1, items: { coin: 4321 }, note: 'e2e' },
  });
  expect(made.ok()).toBe(true);
  await page.goto('/mail');
  await page.getByTestId('redeem-input').fill(code.toLowerCase());
  await page.getByTestId('redeem-go').click();
  await expect(page.getByText('兑换成功：银币 4,321')).toBeVisible();

  await page.goto('/invite');
  const link = (await page.getByTestId('invite-link').innerText()).trim();
  const inviteCode = new URL(link).searchParams.get('invite')!;
  // 新开一个浏览器上下文注册被邀请人
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await closeAnnouncements(page2);
  await registerAndOpen(page2, request, { inviteCode });
  // worker 每分钟扫描一次：最多等 70 秒
  await expect(async () => {
    await page2.goto('/mail');
    await expect(page2.getByText('欢迎来到小镇')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 70_000, intervals: [5_000] });
  await ctx2.close();
});

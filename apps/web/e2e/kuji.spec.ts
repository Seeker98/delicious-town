import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 一番赏：新注册的号买 1 张券、抽 1 张，看到结果、券数归零。只改本用例的号的银币 */
test('一番赏：买券、抽签', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      `update restaurant set coin = 1000000 where account_id = (select id from account where lower(username) = lower($1))`,
      [username],
    );
    await page.goto('/kuji');
    await expect(page.getByTestId('kj-pool')).toBeVisible();
    await page.getByTestId('kj-buy-num').fill('1');
    await page.getByTestId('kj-buy').click();
    await expect(page.getByTestId('kj-tickets')).toContainText('1 张');
    await page.getByTestId('kj-draw-1').click();
    await expect(page.getByTestId('kj-result')).toBeVisible();
    await expect(page.getByTestId('kj-tickets')).toContainText('0 张');
  } finally {
    await client.end();
  }
});

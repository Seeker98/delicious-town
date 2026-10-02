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
    // 开发库的区服是共用的：今天的池可能已经被抽满（每天最多 maxPools 池，问题记录 274），
    // 这时只检查提示和按钮禁用，不去改别人的数据
    if (await page.getByTestId('kj-closed').isVisible()) {
      await expect(page.getByTestId('kj-closed')).toContainText('明天 0 点再来');
      await expect(page.getByTestId('kj-draw-1')).toBeDisabled();
      return;
    }
    await page.getByTestId('kj-draw-1').click();
    await expect(page.getByTestId('kj-result')).toBeVisible();
    await expect(page.getByTestId('kj-tickets')).toContainText('0 张');
  } finally {
    await client.end();
  }
});

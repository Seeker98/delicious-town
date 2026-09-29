import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';
const PATH = 'tuning.settlement.expMultiplier';

test('后台：设为管理员 → 改经验倍率并立即生效 → 审计里有记录 → 恢复默认', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  // 等同于 pnpm --filter @dt/server account role <用户名> admin
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }

  await page.goto('/admin/shards/1');
  const input = page.getByTestId(`setting-${PATH}`);
  await expect(input).toBeVisible();
  const before = (await page.getByTestId(`effective-${PATH}`).innerText()).trim();
  const target = before === '10' ? '11' : '10';
  await input.fill(target);
  await input.blur();
  await page.getByTestId('save-note').fill('e2e 调整经验倍率');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId(`effective-${PATH}`)).toHaveText(target);

  await page.getByTestId(`reset-${PATH}`).click();
  await page.getByTestId('save-note').fill('e2e 恢复默认');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId(`reset-${PATH}`)).toHaveCount(0);

  await page.goto('/admin/audit');
  await expect(page.getByRole('cell', { name: '修改区服数值' }).first()).toBeVisible();
});

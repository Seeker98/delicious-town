import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('论坛：发攻略帖 → 点赞 → 回复一楼 → 回复 #1 → 删除自己的回复', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const title = `e2e攻略${Date.now().toString(36).slice(-5)}`;

  await page.goto('/forum');
  await page.getByTestId('forum-new').click();
  await page.getByTestId('edit-cat-guide').check();
  await page.getByTestId('edit-title').fill(title);
  await page.getByTestId('edit-content').fill('第一行\n第二行');
  await page.getByTestId('edit-submit').click();
  await expect(page.getByTestId('post-body')).toContainText('第二行');

  await page.getByTestId('post-up').click();
  await expect(page.getByTestId('post-up')).toHaveClass(/active/);

  await page.getByTestId('reply-content').fill('一楼');
  await page.getByTestId('reply-submit').click();
  await expect(page.getByTestId('reply-1')).toContainText('一楼');

  // 回复有 60 秒冷却：把本测试店自己的回复时间往前挪，只动这家店的数据
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      `update forum_reply set created_at = created_at - interval '2 minutes' where rest_id = $1`,
      [overview.data.id],
    );
  } finally {
    await client.end();
  }

  await page.getByTestId('reply-to-1').click();
  await expect(page.getByTestId('reply-target')).toContainText('回复 #1');
  await page.getByTestId('reply-content').fill('二楼');
  await page.getByTestId('reply-submit').click();
  await expect(page.getByTestId('reply-2')).toContainText('回复 #1');

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('reply-delete-2').click();
  await expect(page.getByTestId('reply-2')).toContainText('该回复已删除');

  await page.goto('/forum');
  await page.getByTestId('forum-tab-guide').click();
  await expect(page.getByText(title)).toBeVisible();
});

import pg from 'pg';
import { closeAnnouncements, expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

async function query<T>(text: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** 只操作本用例注册的三个账号：B 写公告，A 举报，C 设为管理员处理 */
test('举报公告 → 管理员处理 → 公告清空、举报人收到结果邮件', async ({ page, browser, request }) => {
  test.setTimeout(150_000);
  const notice = `加我微信领福利${Date.now().toString(36)}`;

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await closeAnnouncements(pageB);
  const B = await registerAndOpen(pageB, request);
  await pageB.goto('/rest/look');
  await pageB.getByTestId('notice').fill(notice);
  await pageB.getByTestId('save-notice').click();
  await expect(pageB.getByText('公告已保存')).toBeVisible();
  const [bRest] = await query<{ id: number }>('select id from restaurant where name = $1', [B.name]);

  await registerAndOpen(page, request);
  await page.goto(`/friends/${bRest!.id}`);
  await expect(page.getByText(notice)).toBeVisible();
  await page.getByTestId('notice-report-open').click();
  await page.getByTestId('notice-report-reason-ad').check();
  await page.getByTestId('notice-report-submit').click();
  await expect(page.getByText('已收到举报')).toBeVisible();

  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await closeAnnouncements(pageC);
  const C = await registerAndOpen(pageC, request);
  await query(`update account set role = 'admin' where lower(username) = lower($1)`, [C.username]);
  await pageC.goto('/admin/reports');
  await pageC.getByText(notice).first().click();
  await pageC.getByTestId('report-note').fill('广告');
  pageC.once('dialog', (d) => void d.accept());
  await pageC.getByTestId('report-resolve').click();
  await expect(pageC.getByText('已处理')).toBeVisible();

  await page.goto('/mail');
  await expect(page.getByText('举报结果')).toBeVisible();
  await page.goto(`/friends/${bRest!.id}`);
  await expect(page.getByTestId('rest-name-report-open')).toBeVisible();
  await expect(page.getByText(notice)).toHaveCount(0);
  await ctxB.close();
  await ctxC.close();
});

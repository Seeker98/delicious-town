import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('小镇：广播 → 和雯姐聊天 → 镇长兑换', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 1 星、邮箱已验证；喇叭 2 个、蟹黄堡 5 个（兑换第 1 项神秘食材随机劵要 2 个）
    await client.query(`update restaurant set star_level = 1 where id = $1`, [restId]);
    await client.query(
      `update account set email_verified_at = now() where id = (select account_id from restaurant where id = $1)`,
      [restId],
    );
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 315, 2), ($1, 180, 5)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [restId],
    );

    await page.goto('/town');
    await page.getByTestId('tab-news').click();
    await page.getByTestId('bc-input').fill('端到端测试的广播');
    const sent = page.waitForResponse((r) => r.url().includes('/api/v1/town/broadcast'));
    await page.getByTestId('bc-send').click();
    expect((await sent).ok()).toBe(true);
    await expect(page.getByTestId('news-row').first()).toContainText('端到端测试的广播');

    await page.getByTestId('tab-town').click();
    await page.getByTestId('talk-wenjie').click();
    await expect(page.getByTestId('talk-wenjie')).toHaveText('今天聊过了');

    await page.getByTestId('tab-exchange').click();
    const done = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/town/exchange') && r.request().method() === 'POST',
    );
    await page.getByTestId('ex-1').click();
    expect((await done).ok()).toBe(true);
    await expect(page.getByTestId('ex-row-1')).toContainText('有 3');
  } finally {
    await client.end();
  }
});

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
      `insert into store_item (rest_id, goods_id, num) values ($1, 10417, 2), ($1, 10005, 5)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [restId],
    );

    await page.goto('/town');
    await page.getByTestId('tab-news').click();
    // 广播是一行，点“发广播”从下面弹出面板（界面改版 P10）
    await page.getByTestId('bc-open').click();
    await page.getByTestId('bc-input').fill('端到端测试的广播');
    const sent = page.waitForResponse((r) => r.url().includes('/api/v1/town/broadcast'));
    await page.getByTestId('bc-send').click();
    expect((await sent).ok()).toBe(true);
    await expect(page.getByTestId('news-row').first()).toContainText('端到端测试的广播');

    // 雯姐搬到了酒吧（问题记录 453）；聊过后按钮换成“今天聊过了”小标签（界面改版 P10）
    await page.goto('/bar');
    await page.getByTestId('talk-wenjie').click();
    await expect(page.getByTestId('talk-wenjie')).toHaveText('今天聊过了');

    // 兑换搬到协会的镇长大胃锅（问题记录 441）
    await page.goto('/society/mayor');
    const done = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/town/exchange') && r.request().method() === 'POST',
    );
    // 点“兑换”从下面弹出选份数的面板，确认才兑换（界面改版 P10）
    await page.getByTestId('ex-1').click();
    await page.getByTestId('qty-ok').click();
    expect((await done).ok()).toBe(true);
    await expect(page.getByTestId('ex-row-1')).toContainText('有 3');
  } finally {
    await client.end();
  }
});

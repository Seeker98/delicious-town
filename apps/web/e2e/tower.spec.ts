import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('厨塔：试打 → 挑战 1 层 → 赛厨榜占位 → 声望商店兑换美味券', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 属性远高于 1 层守塔人（厨力 29），挑战必胜；声望 100
    await client.query(
      `update restaurant set strength = 100, renown = 100,
         attr_cook = 50, attr_cutting = 50, attr_fire = 50, attr_season = 30 where id = $1`,
      [restId],
    );
    // 只清掉端到端测试账号自己占的名次，免得一服的榜被以前的测试占满
    await client.query(
      `delete from tower_rank where rest_id in (
         select r.id from restaurant r join account a on a.id = r.account_id where a.email like '%@e2e.local')`,
    );

    await page.goto('/tower');
    await page.getByTestId('tab-tower').click();
    await page.getByTestId('tp-1').click();
    await expect(page.getByTestId('duel-headline')).toContainText('试打：赢了');
    await page.getByTestId('tc-1').click();
    await expect(page.getByTestId('duel-headline')).toContainText('你赢了，声望 +7');

    await page.getByTestId('tab-rank').click();
    await expect(page.getByTestId('my-rank')).toHaveText('未上榜');
    await page.locator('[data-testid^="occupy-"]').first().click();
    await expect(page.getByTestId('my-rank')).toContainText('名');
    await expect(page.getByTestId('my-rank')).not.toHaveText('未上榜');

    await page.getByTestId('tab-shop').click();
    await expect(page.getByTestId('shop-renown')).toContainText('107');
    await page.getByTestId('buy-310').click();
    await expect(page.getByTestId('shop-renown')).toContainText('47');
  } finally {
    await client.end();
  }
});

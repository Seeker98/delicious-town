import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('酒吧扩展：魔鬼辣杯喝到出结果；飞镖投三镖', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 10001, 50)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [overview.data.id],
    );
  } finally {
    await client.end();
  }

  // 每个游戏单独一页（界面改版 P9）；魔鬼辣杯先选押注档，再点开喝
  await page.goto('/bar/devil');
  await page.getByTestId('devil-stake-1').click();
  await expect(page.getByTestId('devil-stake-1')).toHaveAttribute('aria-checked', 'true');
  const started = page.waitForResponse((r) => r.url().includes('/api/v1/bar/devil/start'));
  await page.getByTestId('devil-start').click();
  expect((await started).ok()).toBe(true);
  await expect(page.getByTestId('devil-cup-0')).toBeVisible();
  // 一直挑还没喝过的杯，直到有人喝到特辣酒
  for (let i = 0; i < 6; i++) {
    if (await page.getByTestId('devil-result').isVisible()) break;
    const drank = page.waitForResponse((r) => r.url().includes('/api/v1/bar/devil/drink'));
    await page.locator('[data-testid^="devil-cup-"]:not([disabled])').first().click();
    expect((await drank).ok()).toBe(true);
  }
  await expect(page.getByTestId('devil-result')).toBeVisible();

  await page.goto('/bar/darts');
  await page.getByTestId('darts-start').click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('darts-aim').click();
    const thrown = page.waitForResponse((r) => r.url().includes('/api/v1/bar/darts/throw'));
    await page.getByTestId('darts-throw').click();
    expect((await thrown).ok()).toBe(true);
  }
  await expect(page.getByTestId('darts-result')).toContainText('老板');
});

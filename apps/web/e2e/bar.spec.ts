import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('酒吧：划拳一次 → 礼券换蟹币 → 老虎机抽一次', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 神秘礼券定为 300 张（开店礼包可能已经送了一些）
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 1, 300)
       on conflict (rest_id, goods_id) do update set num = 300`,
      [restId],
    );

    await page.goto('/bar');
    await expect(page.getByTestId('bar-wallet')).toContainText('神秘礼券 300');
    await page.getByTestId('tab-fg').click();
    await page.getByTestId('fg-0').click();
    await expect(page.getByTestId('fg-result')).toContainText('你出石头');
    await expect(page.getByTestId('bar-wallet')).toContainText('神秘礼券 299');

    await page.getByTestId('tab-slot').click();
    await page.getByTestId('ex-num').fill('1');
    await page.getByTestId('ex-go').click();
    await expect(page.getByTestId('bar-wallet')).toContainText('蟹币 1');

    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('slot-result')).toContainText('第 1 次');
    await expect(page.getByTestId('slot-stats')).toContainText('共 3 格');
  } finally {
    await client.end();
  }
});

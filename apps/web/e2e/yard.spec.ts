import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('菜园：开地 → 买种子 → 播种 → 浇水到收获期 → 收获 → 存进橱柜', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set coin = 1000000, strength = 100 where id = $1', [restId]);

    await page.goto('/yard');
    await page.getByTestId('tab-land').click();
    await page.getByTestId('expand').click();
    await expect(page.getByTestId('land-1')).toContainText('1 号地');

    await page.getByTestId('tab-seed').click();
    await page.getByTestId('shop-seed').selectOption('1');
    await page.getByTestId('shop-buy').click();
    await expect(page.getByTestId('seed-stock')).toContainText('× 1');

    await page.getByTestId('tab-land').click();
    await page.getByTestId('sow-1').click();
    await expect(page.getByTestId('land-1')).toContainText('幼年期');

    for (const next of ['育苗期', '成长期', '收获期']) {
      // 把本阶段的开始时间往前拨一天，并清掉自然事件可能带来的虫、草、干涸
      await client.query(
        "update yard_plant set stage_at = now() - interval '1 day', worm = 0, grass = 0, dry = 0 where rest_id = $1",
        [restId],
      );
      await page.reload();
      await page.getByTestId('land-1').getByTestId('plant-water').click();
      await expect(page.getByTestId('land-1')).toContainText(next);
    }

    await page.getByTestId('land-1').getByTestId('plant-reap').click();
    await expect(page.getByTestId('sow-1')).toBeVisible();

    await page.getByTestId('tab-basket').click();
    await page.getByTestId('basket-store-1001').click();
    await expect(page.getByTestId('basket-empty')).toBeVisible();
  } finally {
    await client.end();
  }
});

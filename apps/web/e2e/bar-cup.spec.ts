import type { CupDto } from '@dt/shared';
import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('猜酒杯：猜第 1 轮，猜中就收手，猜错就再来一局，直到拿到一次奖励', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 10001, 20)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [overview.data.id],
    );
  } finally {
    await client.end();
  }

  await page.goto('/bar');
  await page.getByTestId('tab-cup').click();
  await expect(page.getByTestId('cup-tier-3')).toBeVisible();
  let s: CupDto | null = null;
  for (let i = 0; i < 10 && s?.result !== 'stop'; i++) {
    if (s?.result === 'lose') await page.getByTestId('cup-again').click();
    const res = page.waitForResponse((r) => r.url().includes('/api/v1/bar/cup/guess'));
    await page.getByTestId('cup-0').click();
    s = ((await (await res).json()) as { data: CupDto }).data;
    if (s.won) {
      await expect(page.getByTestId('cup-won')).toBeVisible();
      const stop = page.waitForResponse((r) => r.url().includes('/api/v1/bar/cup/stop'));
      await page.getByTestId('cup-stop').click();
      s = ((await (await stop).json()) as { data: CupDto }).data;
    }
    await expect(page.getByTestId('cup-result')).toBeVisible();
  }
  expect(s?.result).toBe('stop');
  await expect(page.getByTestId('cup-award')).toHaveCount(1);
  await expect(page.getByTestId('cup-streak')).toContainText('1');
});

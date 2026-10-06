import type { DealDto } from '@dt/shared';
import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('一掷千金：选 1 号箱子，依次开别的箱子，每轮都不成交，最后开出自己的箱子', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set coin = 50000 where id = $1', [overview.data.id]);
  } finally {
    await client.end();
  }

  await page.goto('/bar');
  await page.getByTestId('tab-deal').click();
  const call = async (url: string, click: () => Promise<void>): Promise<DealDto> => {
    const res = page.waitForResponse((r) => r.url().includes(url));
    await click();
    const r = await res;
    expect(r.ok()).toBe(true);
    return ((await r.json()) as { data: DealDto }).data;
  };
  let s = await call('/api/v1/bar/deal/start', () => page.getByTestId('deal-start').click());
  s = await call('/api/v1/bar/deal/pick', () => page.getByTestId('deal-box-0').click());
  for (let step = 0; step < 20 && !s.result; step++) {
    if (s.offer !== null) {
      await expect(page.getByTestId('deal-offer')).toBeVisible();
      s = await call('/api/v1/bar/deal/answer', () => page.getByTestId('deal-no').click());
      continue;
    }
    const opened = new Set(s.opened.map((o) => o.box));
    const next = Array.from({ length: s.count }, (_, i) => i).find((i) => i !== s.mine && !opened.has(i))!;
    s = await call('/api/v1/bar/deal/open', () => page.getByTestId(`deal-box-${next}`).click());
  }
  expect(s.result).toBe('box');
  await expect(page.getByTestId('deal-result')).toContainText('打开你的箱子');
  await expect(page.locator('[data-testid^="deal-all-"]')).toHaveCount(10);
});

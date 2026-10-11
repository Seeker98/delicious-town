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
      `insert into store_item (rest_id, goods_id, num) values ($1, 10001, 300)
       on conflict (rest_id, goods_id) do update set num = 300`,
      [restId],
    );

    // 酒吧首页：头图上的礼券胶囊，点格子进划拳页（界面改版 P9：每个游戏单独一页）
    await page.goto('/bar');
    await expect(page.getByTestId('bar-wallet-tickets')).toContainText('300');
    await page.getByTestId('game-fg').click();
    await expect(page).toHaveURL(/\/bar\/fg$/);
    await expect(page.getByTestId('header-chip')).toHaveAttribute('aria-label', '神秘礼券 300');
    await page.getByTestId('fg-0').click();
    await expect(page.getByTestId('fg-result')).toBeVisible();
    await expect(page.getByTestId('fg-me')).toHaveText('你 · 石头');
    await expect(page.getByTestId('header-chip')).toHaveAttribute('aria-label', '神秘礼券 299');

    // 老虎机页：顶栏胶囊是蟹币；“换”打开数量面板，换 1 个
    await page.goto('/bar/slot');
    await page.getByTestId('ex-open').click();
    await page.getByTestId('ex-num').fill('1');
    await page.getByTestId('qty-ok').click();
    await expect(page.getByTestId('qty-ok')).toHaveCount(0);
    await expect(page.getByTestId('header-chip')).toHaveAttribute('aria-label', '蟹币 1');

    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('slot-result')).toBeVisible();
    await expect(page.getByTestId('slot-reels')).not.toContainText('?');
    await expect(page.getByTestId('slot-stats')).toContainText('共 3 格');
  } finally {
    await client.end();
  }
});

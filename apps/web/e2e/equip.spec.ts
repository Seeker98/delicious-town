import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('厨具：买见习之铲 → 穿戴 → 强化 → 打孔 → 镶嵌 → 保存预设 → 全部卸下 → 套用预设', async ({
  page,
  request,
}) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  // 准备：钱、等级、精华、强化石（保证成功）、打孔石、一颗宝石、一件可以打孔的锅（等同于奖励发放）
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set coin = 2000000, level = 20 where id = $1', [restId]);
    for (const [goodsId, num] of [
      [52, 20],
      [40, 1],
      [46, 1],
      [44, 1],
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [
        restId,
        goodsId,
        num,
      ]);
    }
    await client.query(
      `insert into equip (rest_id, goods_id, part, suit_id, min_level, cur_hole, max_hole, base_fire)
       values ($1, 56, 3, 5, 13, 1, 3, 12)`,
      [restId],
    );
  } finally {
    await client.end();
  }

  // 商店买一件见习之铲（生成实例）
  const buy = await page.request.post('/api/v1/shop/buy', { data: { goodsId: 30, num: 1 } });
  expect(buy.ok()).toBe(true);

  // 穿上铲和锅
  await page.goto('/rest/equip');
  await page.getByTestId('slot-1').click();
  await page.locator('[data-testid^="wear-"]').first().click();
  await expect(page.getByTestId('slot-1')).toContainText('见习之铲');
  await page.getByTestId('slot-3').click();
  await page.locator('[data-testid^="wear-"]').first().click();
  await expect(page.getByTestId('slot-3')).toContainText('沉默之度玛的静谧之镬');

  // 铲：用强化石强化到 +1
  await page.getByTestId('slot-1').click();
  await page
    .getByRole('link', { name: /见习之铲/ })
    .first()
    .click();
  await page.getByTestId('stone').check();
  await page.getByTestId('stress-go').click();
  await expect(page.getByText(/强化成功 \+1/)).toBeVisible();

  // 锅：打孔、镶嵌
  await page.goto('/rest/equip');
  await page.getByTestId('slot-3').click();
  await page
    .getByRole('link', { name: /沉默之度玛的静谧之镬/ })
    .first()
    .click();
  await page.getByTestId('drill-go').click();
  await expect(page.getByTestId('hole-count')).toHaveText('0/2');
  await page.getByTestId('inlay-go').click();
  await expect(page.getByTestId('hole-count')).toHaveText('1/2');

  // 预设：保存 → 全部卸下 → 套用
  await page.goto('/rest/equip');
  await page.getByTestId('open-presets').click();
  await page.getByTestId('preset-name').fill('全套');
  await page.getByTestId('preset-save').click();
  await expect(page.locator('[data-testid^="preset-apply-"]')).toHaveCount(1);
  await page.getByRole('button', { name: '全部卸下' }).click();
  await expect(page.getByTestId('slot-1')).toContainText('空');
  await page.locator('[data-testid^="preset-apply-"]').first().click();
  await expect(page.getByTestId('slot-1')).toContainText('见习之铲 +1');
  await expect(page.getByTestId('slot-3')).toContainText('沉默之度玛的静谧之镬');
});

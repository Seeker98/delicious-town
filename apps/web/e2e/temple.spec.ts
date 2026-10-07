import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('神殿：打守护兽 → 探险 → 冥想准备试炼 → 试炼', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  // 准备：1 星、体力、银币；飞弹和探险图；已学 3 号特色菜（秘·凤凰展翅，食材 262、310、400）；试炼要的食材
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set star_level = 1, strength = 200, coin = 1000000 where id = $1', [
      restId,
    ]);
    for (const [goodsId, num] of [
      [10701, 2], // 极速飞弹
      [10704, 2], // 探险图
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [
        restId,
        goodsId,
        num,
      ]);
    }
    await client.query('insert into rest_mc (rest_id, mc_id, way) values ($1, 3, 1)', [restId]);
    for (const foodsId of [5001, 5009, 2007, 2054, 4016]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 5)
         on conflict (rest_id, foods_id) do update set num = 5`,
        [restId, foodsId],
      );
    }
  } finally {
    await client.end();
  }

  await page.goto('/temple');
  await page.getByTestId('tab-guardian').click();
  await page.getByTestId('missile').selectOption('10701');
  await page.getByTestId('fire').click();
  await expect(page.getByTestId('shots')).toBeVisible();

  await page.getByTestId('tab-explore').click();
  await page.getByTestId('map').selectOption('10704');
  await page.getByTestId('explore').click();
  await expect(page.getByTestId('explore-result')).toContainText('成功');

  await page.getByTestId('tab-trial').click();
  await page.getByTestId('trial-meditate').click();
  await expect(page.getByTestId('trial-target')).toBeVisible();
  // 主料槽默认选中，点完主料自动换到辅料（问题记录 487）
  await page.getByTestId('trial-food-5001').click();
  await page.getByTestId('trial-food-5009').click();
  await page.getByTestId('trial-start').click();
  await expect(page.getByTestId('trial-result')).toContainText('试炼');
});

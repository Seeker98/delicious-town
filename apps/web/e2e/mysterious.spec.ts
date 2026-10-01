import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('特色菜：鉴定 → 学会 → 烹制 → 倒掉', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  // 准备：1 星；神秘食谱和蟹黄堡秘方（100% 成功）；仿膳饽饽的 3 张残卷和食材（等同于奖励发放）
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set star_level = 1 where id = $1', [restId]);
    for (const [goodsId, num] of [
      [162, 1],
      [165, 1],
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [
        restId,
        goodsId,
        num,
      ]);
    }
    await client.query('insert into mc_remnant (rest_id, mc_id, num) values ($1, 1, 3)', [restId]);
    for (const foodsId of [390, 412, 261]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 10)
         on conflict (rest_id, foods_id) do update set num = 10`,
        [restId, foodsId],
      );
    }
  } finally {
    await client.end();
  }

  await page.goto('/temple');
  await page.getByTestId('tool').selectOption('165');
  await page.getByTestId('appraise').click();
  await expect(page.getByTestId('results')).toContainText('残卷');

  await page.goto('/mc');
  await page.getByTestId('learn-1').click();
  await expect(page.getByTestId('learned-1')).toContainText('秘·仿膳饽饽');
  await page.getByTestId('cook-1').click();
  await page.getByTestId('cooknum-5').click();
  await expect(page.getByTestId('mc-current')).toContainText('秘·仿膳饽饽');

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('dump').click();
  await expect(page.getByTestId('mc-current')).toHaveCount(0);
});

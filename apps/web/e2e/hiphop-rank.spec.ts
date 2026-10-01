import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

interface DayRow {
  shard_id: number;
  day: string;
  place: number;
  rest_id: number | null;
  foods_id: number;
  worth: number;
  created_at: Date;
}

test('嘻哈男孩、镇长问答、排行', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number; shardId: number };
  };
  const { id: restId, shardId } = overview.data;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  // 今天的地点是全区共享的：先记下原记录，测试结束后还原
  const before = await client.query<DayRow>(
    `select * from hiphop_day where shard_id = $1 order by day desc limit 1`,
    [shardId],
  );
  try {
    expect((await page.request.post('/api/v1/test/hiphop', { data: { shardId, place: 1 } })).ok()).toBe(true);
    const spot = (await (await page.request.get('/api/v1/hiphop?place=1')).json()) as {
      data: { here: boolean };
    };

    await page.goto('/market');
    if (spot.data.here) {
      await expect(page.getByTestId('hiphop-card')).toBeVisible();
      await page.getByTestId('hiphop-kind-coin').click();
      await page.getByTestId('hiphop-num').fill('10000');
      await page.getByTestId('hiphop-tip').click();
      await expect(page.getByTestId('hiphop-result')).toBeVisible();
    } else {
      // 9 点前、22 点后他不出来，卡片不显示
      await expect(page.getByRole('button', { name: '买' }).first()).toBeVisible();
      await expect(page.getByTestId('hiphop-card')).toHaveCount(0);
    }

    await page.goto('/town');
    await page.getByTestId('tab-town').click();
    await page.getByTestId('mayor-open').click();
    await page.getByTestId('mayor-1').click();
    await expect(page.getByText('谢谢你，我现在就去找他')).toBeVisible();

    await page.goto('/town?tab=rank');
    await page.getByTestId('rank-group-等级').click();
    await expect(page.getByTestId(`rank-row-${restId}`).or(page.getByTestId('rank-me'))).toBeVisible();
  } finally {
    const today = await client.query<{ day: string }>(
      `select day from hiphop_day where shard_id = $1 order by day desc limit 1`,
      [shardId],
    );
    const old = before.rows[0];
    if (old && old.day === today.rows[0]?.day) {
      await client.query(
        `update hiphop_day set place = $3, rest_id = $4, foods_id = $5, worth = $6 where shard_id = $1 and day = $2`,
        [shardId, old.day, old.place, old.rest_id, old.foods_id, old.worth],
      );
    } else if (today.rows[0]) {
      await client.query(`delete from hiphop_day where shard_id = $1 and day = $2`, [
        shardId,
        today.rows[0].day,
      ]);
    }
    await client.end();
  }
});

import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('经营循环：签到 → 推进一轮看到收益 → 加油领主线 → 菜场买菜 → 学会第一道食谱', async ({
  page,
  request,
}) => {
  await registerAndOpen(page, request);

  // 签到
  await page.goto('/rest/tasks');
  await page.getByTestId('signin').click();
  await expect(page.getByText('每日签到礼包')).toBeVisible();

  // 推进一轮：结算、天气、菜场都会执行
  // 开发服务器重启后时钟偏移归零，而 job_run 里可能已记下上次运行的同一轮；多推进几轮直到本店结算过
  for (let i = 0; i < 5; i++) {
    const tick = await page.request.post('/api/v1/test/tick', { data: { minutes: 4 } });
    expect(tick.ok()).toBe(true);
    const o = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
      data: { lastRound: unknown };
    };
    if (o.data.lastRound) break;
  }
  await page.goto('/');
  await expect(page.getByTestId('last-round')).toBeVisible();

  // 结算耗了油，加油后领主线第 1 步
  await page.getByTestId('refuel').click();
  await expect(page.getByText('消耗 银币')).toBeVisible();
  // 加油后页面会刷新并重新渲染任务卡片，等进度显示 1/1 再点，并等领奖请求返回
  await expect(page.getByText('（1/1）')).toBeVisible();
  const claimed = page.waitForResponse((r) => r.url().includes('/api/v1/task/claim'));
  await page.getByRole('button', { name: '领奖' }).click();
  expect((await claimed).ok()).toBe(true);
  await expect(page.getByText('获得 银币 2,000')).toBeVisible();

  // 菜场买 1 份日常菜
  await page.goto('/market');
  const firstBuy = page.locator('[data-testid^="buy-"]').first();
  await expect(firstBuy).toBeVisible();
  await firstBuy.click();
  await expect(page.getByText(/^获得 .+×1(；消耗 .+)?$/)).toBeVisible();

  // 准备第一道菜（新手街 194）需要的食材，然后在食谱页学会它
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const foodsId of [302, 253, 366]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 1)
         on conflict (rest_id, foods_id) do update set num = cupboard_food.num + 1`,
        [overview.data.id, foodsId],
      );
    }
  } finally {
    await client.end();
  }
  await page.goto('/cookbooks');
  await page.getByTestId('learn-194').click();
  // 学会后这道菜排到后面去了，按"已学数量"确认
  await expect(page.getByText('共学会 1 道')).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});

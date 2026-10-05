import { expect, test } from './fixtures';
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

  // 结算耗了油，加油后领主线（问题记录 318：第 1 章任务同时列出，首页显示第一个可领的——签到或加油）
  await page.getByTestId('refuel').click();
  await expect(page.getByText('消耗 银币')).toBeVisible();
  // 加油后页面会刷新并重新渲染任务卡片，等进度显示 1/1 再点，并等领奖请求返回
  await expect(page.getByText('（1/1）')).toBeVisible();
  const claimed = page.waitForResponse((r) => r.url().includes('/api/v1/task/claim'));
  await page.getByRole('button', { name: '领奖' }).click();
  expect((await claimed).ok()).toBe(true);
  await expect(page.getByText(/获得 银币 (2,000|3,000)/)).toBeVisible();

  // 菜场买 1 份日常菜
  await page.goto('/market');
  // 限购按店、设备、网络分别算：本机（同一网络）试玩时可能已经把这一批买满了。
  // 能买就买一个第一个还能买的；都买不了时页面要写明是同一网络买满了
  const daily = page.locator('section').first();
  await expect(daily.locator('[data-testid^="buy-"]').first()).toBeVisible();
  const buyable = daily.locator('[data-testid^="buy-"]:not([disabled])');
  if ((await buyable.count()) > 0) {
    await buyable.first().click();
    // 只认提示里有"获得 …×1"：同一次还可能掉别的（比如活动货币×2），以前要求整句以 ×1 结尾，偶尔对不上（backlog）
    await expect(
      page
        .getByTestId('toast')
        .filter({ hasText: /获得 .*×1/ })
        .first(),
    ).toBeVisible();
  } else {
    await expect(daily.getByText(/同一网络或设备本轮已买/).first()).toBeVisible();
  }

  // 准备第一道菜（新手街的桑椹葡萄粥 100001）需要的食材，然后在食谱页学会它
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const foodsId of [2046, 1021, 3046]) {
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
  await page.getByTestId('learn-100001').click();
  // 学会后这道菜排到后面去了，按"已学数量"确认
  // 菜谱总数跟配置走，不写死（backlog #115）
  await expect(page.getByTestId('cookbook-counts')).toContainText(/共学会 1 \/ [\d,]+ 道/);

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});

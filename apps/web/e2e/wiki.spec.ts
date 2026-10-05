import { expect, test } from './fixtures';

/** 游戏资料（问题记录 142）：不登录就能看；搜菜名进菜谱详情，点食材进食材详情，食材页列出这道菜。只读，不改任何数据 */
test('游戏资料：不登录搜菜谱 → 菜谱详情 → 食材详情', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-wiki').click();
  await expect(page).toHaveURL(/\/wiki$/);
  // 菜谱数跟配置走，不写死（backlog #115）
  await expect(page.getByTestId('wiki-kind-cookbooks')).toContainText(/\d[\d,]* 条/);
  await page.getByTestId('wiki-home-q').fill('南煎丸子');
  await page.getByTestId('wiki-hit-cookbooks-106001').click();
  await expect(page).toHaveURL(/\/wiki\/cookbooks\/106001$/);
  await expect(page.getByRole('heading', { name: '南煎丸子' })).toBeVisible();
  const grades = page.getByTestId('wiki-grades');
  const firstFood = grades.locator('a').first();
  const foodName = (await firstFood.textContent())!.trim();
  await firstFood.click();
  await expect(page).toHaveURL(/\/wiki\/foods\/\d+$/);
  await expect(page.getByRole('heading', { name: foodName })).toBeVisible();
  // 用到它的菜谱按编号（街道）排、一次显示 50 道：南煎丸子在山东街，可能要点“再显示”
  const list = page.getByTestId('wiki-cookbooks');
  const more = page.getByRole('button', { name: /再显示 \d+ 条/ });
  while (!(await list.getByText('南煎丸子').count()) && (await more.count())) await more.click();
  await expect(list).toContainText('南煎丸子');
});

/** 重新编号前的旧链接：跳到新编号（设计 §5） */
test('游戏资料：旧编号的链接跳到新编号', async ({ page }) => {
  await page.goto('/wiki/goods/1');
  await expect(page).toHaveURL(/\/wiki\/goods\/10001$/);
  await expect(page.getByRole('heading', { name: '神秘礼券' })).toBeVisible();
});

import { expect, test } from './fixtures';

/** 游戏资料（问题记录 142）：不登录就能看；搜菜名进菜谱详情，点食材进食材详情，食材页列出这道菜。只读，不改任何数据 */
test('游戏资料：不登录搜菜谱 → 菜谱详情 → 食材详情', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-wiki').click();
  await expect(page).toHaveURL(/\/wiki$/);
  // 菜谱数跟配置走，不写死（backlog #115）
  await expect(page.getByTestId('wiki-kind-cookbooks')).toContainText(/\d[\d,]* 条/);
  await page.getByTestId('wiki-home-q').fill('南煎丸子');
  await page.getByTestId('wiki-hit-cookbooks-1').click();
  await expect(page).toHaveURL(/\/wiki\/cookbooks\/1$/);
  await expect(page.getByRole('heading', { name: '南煎丸子' })).toBeVisible();
  const grades = page.getByTestId('wiki-grades');
  const firstFood = grades.locator('a').first();
  const foodName = (await firstFood.textContent())!.trim();
  await firstFood.click();
  await expect(page).toHaveURL(/\/wiki\/foods\/\d+$/);
  await expect(page.getByRole('heading', { name: foodName })).toBeVisible();
  await expect(page.getByTestId('wiki-cookbooks')).toContainText('南煎丸子');
});

import { expect, test } from './fixtures';
import { mailLink } from './helpers';

test('注册 → 验证邮箱 → 选区服 → 开店；同一账号在二服再开一家，互不影响', async ({ page, request }) => {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;

  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill('secret123');
  await page.getByLabel('确认密码').fill('secret123');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page).toHaveURL(/\/shards/);

  await page.goto(await mailLink(request, email));
  await expect(page.getByText('邮箱验证好了')).toBeVisible();

  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  await expect(page).toHaveURL(/\/create-restaurant/);
  await page.getByLabel('餐厅名称').fill(`一店${id.slice(-4)}`);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('page-title')).toHaveText(`一店${id.slice(-4)}`);
  await expect(page.getByTestId('rest-level')).toHaveText('1');
  await expect(page.getByTestId('rest-coin')).toHaveText('100,000');

  await page.getByRole('link', { name: '切换区服' }).click();
  await page.getByRole('button', { name: /二服/ }).click();
  await page.getByLabel('餐厅名称').fill(`二店${id.slice(-4)}`);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('page-title')).toHaveText(`二店${id.slice(-4)}`);
  await expect(page.getByTestId('rest-coin')).toHaveText('100,000');

  await page.getByRole('link', { name: '切换区服' }).click();
  await page.getByRole('button', { name: /一服/ }).click();
  await expect(page.getByTestId('page-title')).toHaveText(`一店${id.slice(-4)}`);

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});

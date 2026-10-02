import { expect, test } from './fixtures';
import { mailLink } from './helpers';

/** 多语言（问题记录 272）：登录页切英语 → 注册、开店全程英文 → 刷新仍是英文 → 账号上记着 en。只用本用例新注册的号 */
test('登录页选 English 后注册开店，首页英文，刷新后不变，账号记住语言', async ({ page, request }) => {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;

  await page.goto('/login');
  await page.getByTestId('lang-select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Log in to Delicious Town' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Join Delicious Town' })).toBeVisible();
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password', { exact: true }).fill('secret123');
  await page.getByPlaceholder('Confirm password').fill('secret123');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/shards/);
  await expect(page.getByRole('heading', { name: 'Choose a server' })).toBeVisible();

  await page.goto(await mailLink(request, email));
  await expect(page.getByText('Email verified!')).toBeVisible();
  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  await expect(page.getByRole('heading', { name: 'Open a restaurant' })).toBeVisible();
  const name = `店${id.slice(-5)}`;
  await page.getByPlaceholder('Restaurant name').fill(name);
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(name);
  await expect(page.getByTestId('home-todo')).toContainText("Today's to-do");
  await expect(page.getByTestId('home-switches')).toContainText('Business settings');

  await page.reload();
  await expect(page.getByTestId('home-todo')).toContainText("Today's to-do");
  await expect(page.getByTestId('home-todo')).not.toContainText('今日待办');

  const me = (await (await page.request.get('/api/v1/account/me')).json()) as {
    data: { lang: string | null };
  };
  expect(me.data.lang).toBe('en');
});

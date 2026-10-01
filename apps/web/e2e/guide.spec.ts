import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

/** 只用本用例注册的账号：领新手码 → 改密码 → 用新密码登录（问题记录 150、178） */
test('游玩指引领新手码；我的账号改密码后用新密码登录', async ({ page, request }) => {
  test.setTimeout(120_000);
  const me = await registerAndOpen(page, request);

  await page.goto('/guide');
  await page.getByTestId('guide-redeem-XINSHOU').click();
  await expect(page.getByText('领取成功')).toBeVisible();
  await expect(page.getByTestId('guide-redeem-XINSHOU')).toHaveCount(0);

  await page.goto('/account');
  await expect(page.getByTestId('acc-rest-1')).toContainText(me.name);
  await page.getByTestId('acc-old').fill('secret123');
  await page.getByTestId('acc-new').fill('newpass123');
  await page.getByTestId('acc-new2').fill('newpass123');
  await page.getByTestId('acc-change').click();
  await expect(page.getByText('其他设备已下线')).toBeVisible();

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder('用户名').fill(me.username);
  await page.getByPlaceholder('密码').fill('newpass123');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

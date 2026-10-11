import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

/** 只用本用例注册的账号：领新手码（界面改版 P2b 起在兑换码页） → 改密码 → 用新密码登录（问题记录 150、178） */
test('兑换码页领新手码；我的账号改密码后用新密码登录', async ({ page, request }) => {
  test.setTimeout(120_000);
  const me = await registerAndOpen(page, request);

  await page.goto('/redeem');
  await page.getByTestId('guide-redeem-XINSHOU').click();
  await expect(page.getByText('领取成功')).toBeVisible();
  await expect(page.getByTestId('guide-redeem-XINSHOU')).toHaveCount(0);

  // 我的店在切换区服页（界面改版 P11）；改密码在账号页的面板里
  await page.goto('/shards');
  await expect(page.getByTestId('shard-1')).toContainText(me.name);
  await page.goto('/account');
  await page.getByTestId('acc-pw').click();
  await page.getByTestId('acc-old').fill('secret123');
  await page.getByTestId('acc-new').fill('newpass123');
  await page.getByTestId('acc-new2').fill('newpass123');
  await page.getByTestId('acc-change').click();
  await expect(page.getByText('其他设备已下线')).toBeVisible();

  await page.getByTestId('acc-logout').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('用户名').fill(me.username);
  await page.getByLabel('密码', { exact: true }).fill('newpass123');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

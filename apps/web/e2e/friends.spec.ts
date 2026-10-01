import { closeAnnouncements, expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

test('两个玩家互加好友、放蟑螂、灭蟑螂、白食、点赞和回赞', async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await closeAnnouncements(a);
  await closeAnnouncements(b);
  const A = await registerAndOpen(a, request);
  const B = await registerAndOpen(b, request);

  // 结算每 4 分钟一轮，桌子上可能已经坐了顾客；按内容找"空桌"和"蟑螂"，不写死桌号
  const emptyTable = (p: typeof a) => p.locator('[data-testid^="table-"]', { hasText: '空桌' }).first();

  // A 搜索 B 并申请
  await a.goto('/friends');
  await a.getByTestId('tab-find').click();
  await a.getByTestId('search-input').fill(B.name);
  await a.getByTestId('search-input').press('Enter');
  // 等 B 出现在搜索结果里再点它那一行的按钮（"同街道"列表里也有"加好友"按钮）
  await a.locator('.border', { hasText: B.name }).getByRole('button', { name: '加好友' }).click();
  await expect(a.getByText('申请已发出')).toBeVisible();

  // B 同意（蟹老板的申请可能也在列表里，按名字找 A 的那条）
  await b.goto('/friends');
  await b.getByTestId('tab-requests').click();
  await b
    .locator('[data-testid^="request-"]', { hasText: A.name })
    .getByRole('button', { name: '同意' })
    .click();
  await expect(b.getByText(`你和「${A.name}」成为了好友`)).toBeVisible();

  // A 在 B 店的一张空桌放蟑螂
  await a.goto('/friends');
  await a.getByText(B.name).click();
  await emptyTable(a).click();
  await a.getByTestId('act-lay').click();
  await expect(a.getByText('放了一只蟑螂')).toBeVisible();

  // B 在自己楼层消灭一只蟑螂
  await b.goto('/rest/floor');
  // 活着的蟑螂桌标红（"蟑螂（已消灭）"的桌子不标）
  await b.locator('[data-testid^="table-"].text-danger').first().click();
  await b.getByTestId('act-kill').click();
  await expect(b.getByText('消灭了蟑螂')).toBeVisible();

  // A 设置头像后在 B 店的一张空桌白食，首页出现白食卡片
  await a.goto('/rest/look');
  await a.getByTestId('avatar-1').click();
  await expect(a.getByText('头像已更换')).toBeVisible();
  await a.goto('/friends');
  await a.getByText(B.name).click();
  await emptyTable(a).click();
  await a.getByTestId('act-dine').click();
  await expect(a.getByText('开始白食')).toBeVisible();
  await a.goto('/');
  await expect(a.getByTestId('dine-card')).toContainText(B.name);

  // B 给 A 点赞，A 在动态里一键回赞
  await b.goto('/friends');
  await b.getByText(A.name).click();
  await b.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(b.getByText('点赞成功')).toBeVisible();
  await a.goto('/friends');
  await a.getByTestId('tab-feed').click();
  await expect(a.getByText(`${B.name} 给你点了赞`)).toBeVisible();
  await a.getByTestId('return-all').click();
  await expect(a.getByText('回赞了 1 人')).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

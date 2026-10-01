import { test as base, expect, type Page } from '@playwright/test';

/**
 * 开发库里有没看过的重要公告时，新号进游戏会弹窗挡住点击（子项目 6A）：
 * e2e 只用新注册的号，弹窗一出现就点"知道了"，不去改库里的公告
 */
export async function closeAnnouncements(page: Page): Promise<void> {
  await page.addLocatorHandler(page.getByTestId('announce-popup'), async () => {
    await page.getByTestId('announce-close').click();
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await closeAnnouncements(page);
    await use(page);
  },
});
export { expect };

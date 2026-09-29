import { expect, type APIRequestContext, type Page } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/** 轮询 Mailpit，取出发给 to 的最新邮件里的链接 */
export async function mailLink(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: Array<{ ID: string }> };
    if (messages.length > 0) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as {
        Text: string;
      };
      const m = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.Text);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${to}`);
}

/** 注册 → 验证邮箱 → 选一服 → 开店，返回店名 */
export async function registerAndOpen(page: Page, request: APIRequestContext): Promise<string> {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;
  await page.goto('/register');
  await page.getByPlaceholder('用户名').fill(username);
  await page.getByPlaceholder('密码', { exact: true }).fill('secret123');
  await page.getByPlaceholder('确认密码').fill('secret123');
  await page.getByPlaceholder('邮箱').fill(email);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page).toHaveURL(/\/shards/);
  await page.goto(await mailLink(request, email));
  await expect(page.getByText('邮箱验证成功')).toBeVisible();
  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  const name = `店${id.slice(-5)}`;
  await page.getByPlaceholder('餐厅名称').fill(name);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(name);
  return name;
}

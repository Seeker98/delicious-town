import { expect, type APIRequestContext, type Page } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/**
 * 轮询 Mailpit，取出发给 to 的最新邮件里的链接。只返回路径和参数：邮件里的域名是接口配置的网页地址，
 * 本地同时开着两个网页时可能不是这次测的那个，跟着 baseURL 走（界面改版 P11）
 */
export async function mailLink(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: Array<{ ID: string }> };
    if (messages.length > 0) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as {
        Text: string;
      };
      const m = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.Text);
      if (m) {
        const u = new URL(m[0]);
        return u.pathname + u.search;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${to}`);
}

/** 注册 → 验证邮箱 → 选一服 → 开店，返回用户名和店名；可带邀请码 */
export async function registerAndOpen(
  page: Page,
  request: APIRequestContext,
  opts: { inviteCode?: string } = {},
): Promise<{ username: string; name: string }> {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;
  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill('secret123');
  await page.getByLabel('确认密码').fill('secret123');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  if (opts.inviteCode) await page.getByLabel('邀请码').fill(opts.inviteCode);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page).toHaveURL(/\/shards/);
  await page.goto(await mailLink(request, email));
  await expect(page.getByText('邮箱验证好了')).toBeVisible();
  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  const name = `店${id.slice(-5)}`;
  await page.getByLabel('餐厅名称').fill(name);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('page-title')).toHaveText(name);
  return { username, name };
}

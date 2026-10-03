import pg from 'pg';
import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

async function query<T>(text: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** 只改本用例新建的区服（id ≥ 9000）和注册的账号；一服、二服的数值不碰 */
test('上线检查：管理员一键改自己新建区服的开关；可疑数据页四个标签都能打开', async ({ page, request }) => {
  test.setTimeout(120_000);
  // 以前中途被杀留下的测试区服先关掉，免得出现在上线检查里（backlog 6B-2）；只动本用例建的
  await query(
    `update shard set status = 'closed' where id >= 9000 and name like 'e2e上线%' and status = 'open'`,
    [],
  );
  // 编号取已有测试区服的最大编号 + 1：以前按时间取余，可能和以前关掉的撞车（on conflict 后用的是旧区服）
  const [row] = await query<{ id: number }>(
    `insert into shard (id, name)
       select coalesce(max(id), 8999) + 1, 'e2e上线' || (coalesce(max(id), 8999) + 1) from shard where id >= 9000
       returning id`,
    [],
  );
  const shardId = row!.id;
  const shardName = `e2e上线${shardId}`;
  try {
    const me = await registerAndOpen(page, request);
    await query(`update account set role = 'admin' where lower(username) = lower($1)`, [me.username]);

    await page.goto('/admin');
    await expect(page.getByText(shardName, { exact: true })).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId(`launch-fix-${shardId}`).click();
    await expect(page.getByText('已改成上线值')).toBeVisible();
    await expect(page.getByTestId(`launch-fix-${shardId}`)).toHaveCount(0);

    await page.goto('/admin/suspicious');
    for (const tab of ['bar', 'surge', 'multi', 'redeem']) {
      await page.getByTestId(`sus-tab-${tab}`).click();
      await expect(page.getByText('只作提醒')).toBeVisible();
    }
  } finally {
    // 关掉自己建的区服，不影响以后的上线检查列表
    await query(`update shard set status = 'closed' where id = $1`, [shardId]);
  }
});

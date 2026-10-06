import type { NimDto } from '@dt/shared';
import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('最后一颗糖：新手桌按必胜法选先后、每次拿到剩下 k+1 的倍数，一定赢', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 10001, 50)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [overview.data.id],
    );
  } finally {
    await client.end();
  }

  await page.goto('/bar');
  await page.getByTestId('tab-nim').click();
  const nimOf = async (url: string, click: () => Promise<void>): Promise<NimDto> => {
    const res = page.waitForResponse((r) => r.url().includes(url));
    await click();
    const r = await res;
    expect(r.ok()).toBe(true);
    return ((await r.json()) as { data: NimDto }).data;
  };
  let s = await nimOf('/api/v1/bar/nim/start', () => page.getByTestId('nim-start-novice').click());
  expect(s.needFirst).toBe(true);
  const meFirst = s.pile % (s.k + 1) !== 0;
  s = await nimOf('/api/v1/bar/nim/first', () =>
    page.getByTestId(meFirst ? 'nim-first-me' : 'nim-first-bartender').click(),
  );
  for (let i = 0; i < 20 && !s.result; i++) {
    const n = s.left % (s.k + 1);
    expect(n).toBeGreaterThan(0);
    s = await nimOf('/api/v1/bar/nim/take', () => page.getByTestId(`nim-take-${n}`).click());
  }
  expect(s.result).toBe('win');
  await expect(page.getByTestId('nim-result')).toContainText('你拿到了最后一颗');
});

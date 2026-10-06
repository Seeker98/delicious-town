import type { SpiceDto } from '@dt/shared';
import { expect, test } from './fixtures';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 10 种调料里 4 种不重复的排列 */
function allCodes(): number[][] {
  const out: number[][] = [];
  const rec = (p: number[]) => {
    if (p.length === 4) return void out.push([...p]);
    for (let i = 0; i < 10; i++) if (!p.includes(i)) rec([...p, i]);
  };
  rec([]);
  return out;
}
const score = (secret: number[], g: number[]) => {
  let a = 0;
  let b = 0;
  g.forEach((x, i) => (secret[i] === x ? a++ : secret.includes(x) ? b++ : 0));
  return { a, b };
};

test('秘制调料：每次交和之前回答都吻合的第一个组合，猜到结束，显示结果和配方', async ({ page, request }) => {
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
  await page.getByTestId('tab-spice').click();
  await page.getByTestId('spice-start').click();
  let cand = allCodes();
  let s: SpiceDto | null = null;
  for (let i = 0; i < 8 && !s?.result; i++) {
    const g = cand[0]!;
    for (const x of g) await page.getByTestId(`spice-kind-${x}`).click();
    const res = page.waitForResponse((r) => r.url().includes('/api/v1/bar/spice/guess'));
    await page.getByTestId('spice-submit').click();
    s = ((await (await res).json()) as { data: SpiceDto }).data;
    const last = s.guesses.at(-1)!;
    cand = cand.filter((c) => {
      const x = score(c, g);
      return x.a === last.a && x.b === last.b;
    });
  }
  expect(s?.result).not.toBeNull();
  await expect(page.getByTestId('spice-result')).toBeVisible();
  await expect(page.getByTestId('spice-secret')).toContainText('配方');
});

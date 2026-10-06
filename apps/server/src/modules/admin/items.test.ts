import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { retiredOf } from '@dt/config';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('后台道具整理只读页（问题记录 429）', () => {
  it('协管能看：每个道具、食材的来源、用途、是否下架；已下架的照样列出', async () => {
    const mod = await userWithRole(ctx, 'mod');
    const r = await call(ctx.app, 'GET', '/api/v1/admin/items', { cookie: mod.cookie });
    expect(r.status).toBe(200);
    const d = r.json.data as {
      maxGrade: number;
      grades: unknown[];
      rows: Array<{
        kind: string;
        id: number;
        name: string;
        retired: boolean;
        gives: unknown[];
        uses: unknown[];
      }>;
    };
    expect(d.maxGrade).toBeGreaterThan(0);
    const goods = d.rows.filter((x) => x.kind === 'goods');
    const foods = d.rows.filter((x) => x.kind === 'foods');
    expect(goods.length).toBe(ctx.deps.config.bundle.goods.length);
    expect(foods.length).toBe(ctx.deps.config.bundle.foods.length);
    // 从线上配置的下架名单里取一个（不依赖名单的现状）；下架后没有奖励档位、不在商店卖，来源为空
    const retiredId = [...retiredOf(ctx.deps.config.bundle).goods][0]!;
    expect(goods.find((x) => x.id === retiredId)).toMatchObject({ retired: true, noSource: true });
    const someOnSale = ctx.deps.config.bundle.goods.find((g) => g.onSale && !g.retired)!;
    expect(goods.find((x) => x.id === someOnSale.id)).toMatchObject({ retired: false });
    expect(goods.find((x) => x.id === someOnSale.id)!.gives.length).toBeGreaterThan(0);
  });

  it('普通玩家看不到（后台接口对玩家一律 404）', async () => {
    const p = await userWithRole(ctx, 'player');
    const r = await call(ctx.app, 'GET', '/api/v1/admin/items', { cookie: p.cookie });
    expect(r.status).toBe(404);
  });
});

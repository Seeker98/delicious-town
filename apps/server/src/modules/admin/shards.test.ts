import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { subscribeSettings } from '../../infra/settingsBus';
import { buildGlobals, buildInput } from '../settlement/globals';
import { settleRestaurant } from '../settlement/settle';
import type { AdminActor } from './access';
import { createAdminShards } from './shards';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const S = '/api/v1/admin/shards';
const mult = (m: number) => ({ tuning: { settlement: { expMultiplier: m } } });

describe('区服数值（HTTP）', () => {
  it('查看：默认、覆盖、生效、功能开关', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'GET', `${S}/${shardId}/settings`, { cookie: mod.cookie });
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.version).toBe(0);
    expect(d.override).toEqual({});
    expect(d.effective.tuning.settlement.expMultiplier).toBe(d.defaults.tuning.settlement.expMultiplier);
    expect(d.features).toContainEqual({ name: 'market', enabled: true });
    const list = await call(ctx.app, 'GET', S, { cookie: mod.cookie });
    expect(list.json.data.some((s: { id: number }) => s.id === shardId)).toBe(true);
  });

  it('保存：版本 +1，写历史和审计；再次用旧版本号保存得到 409', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (version: number, m: number) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: mult(m), note: '试玩加速', version },
      });
    const r = await save(0, 10);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ version: 1 });
    expect((await save(0, 12)).json.code).toBe('VERSION_CONFLICT');
    const hist = await call(ctx.app, 'GET', `${S}/${shardId}/history`, { cookie: mod.cookie });
    expect(hist.json.data[0]).toMatchObject({
      version: 1,
      note: '试玩加速',
      changed: ['tuning.settlement.expMultiplier'],
    });
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .selectAll()
      .where('target', '=', `shard:${shardId}`)
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ actor_account_id: admin.accountId, action: 'shard.override' });
  });

  it('非法值 400 INVALID_CONFIG 并指出路径；经验倍率 ≤ 0 被拒（Review Focus 4）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'POST', `${S}/${shardId}/override`, {
      cookie: admin.cookie,
      body: { override: mult(0), note: 'x', version: 0 },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('INVALID_CONFIG');
    expect(r.json.params.issues[0].path).toBe('tuning.settlement.expMultiplier');
  });

  it('mod 不能保存（404）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'POST', `${S}/${shardId}/override`, {
      cookie: mod.cookie,
      body: { override: mult(10), note: 'x', version: 0 },
    });
    expect(r.status).toBe(404);
  });

  it('回滚：取历史版本再保存一版；历史版本在当前结构下不合法时 400（Review Focus 5）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (version: number, m: number) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: mult(m), note: `v${m}`, version },
      });
    await save(0, 10);
    await save(1, 20);
    const rb = await call(ctx.app, 'POST', `${S}/${shardId}/rollback`, {
      cookie: admin.cookie,
      body: { version: 1, note: '回到 10' },
    });
    expect(rb.json.data).toEqual({ version: 3 });
    const now = await call(ctx.app, 'GET', `${S}/${shardId}/settings`, { cookie: admin.cookie });
    expect(now.json.data.override).toEqual(mult(10));
    await ctx.deps.db
      .insertInto('shard_config_history')
      .values({ shard_id: shardId, version: 99, override: JSON.stringify(mult(-1)), note: '旧的坏版本' })
      .execute();
    const bad = await call(ctx.app, 'POST', `${S}/${shardId}/rollback`, {
      cookie: admin.cookie,
      body: { version: 99, note: 'x' },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('INVALID_CONFIG');
  });
});

describe('区服数值（即时生效）', () => {
  let t: TestGame;
  let t2: TestGame;
  const actor: AdminActor = { accountId: 0, username: 'x', role: 'admin', ip: '127.0.0.1' };
  beforeAll(async () => {
    t = await createTestGame();
    t2 = await createTestGame();
    const a = await t.db
      .insertInto('account')
      .values({
        username: `adm${Date.now() % 100000}`,
        password_hash: 'x',
        email: `adm${Date.now()}@t.local`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    actor.accountId = a.id;
  });
  afterAll(async () => {
    await t.close();
    await t2.close();
  });

  it('同进程下一次读取就是新值；结算用到新倍率', async () => {
    const shardId = await createShard(t.db);
    const before = await t.game.shards.settings(shardId);
    await createAdminShards(t.game).save(actor, shardId, { override: mult(10), note: 'x', version: 0 });
    const after = await t.game.shards.settings(shardId);
    expect(after.tuning.settlement.expMultiplier).toBe(10);
    const config = testConfig();
    const exp = (tuning: typeof before.tuning) =>
      settleRestaurant(
        buildInput(config),
        buildGlobals(config, tuning),
        sequenceRng([0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]),
      ).exp;
    expect(exp(after.tuning)).toBeGreaterThan(exp(before.tuning));
  });

  it('另一个进程通过 Redis 订阅失效缓存', async () => {
    const shardId = await createShard(t.db);
    const sub = subscribeSettings(process.env.REDIS_URL!, (id) => t2.game.shards.invalidate(id));
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect((await t2.game.shards.settings(shardId)).tuning.settlement.expMultiplier).not.toBe(7);
      await createAdminShards(t.game).save(actor, shardId, { override: mult(7), note: 'x', version: 0 });
      let seen = 0;
      for (let i = 0; i < 40 && seen !== 7; i++) {
        await new Promise((r) => setTimeout(r, 50));
        seen = (await t2.game.shards.settings(shardId)).tuning.settlement.expMultiplier;
      }
      expect(seen).toBe(7);
    } finally {
      sub.close();
    }
  });
});

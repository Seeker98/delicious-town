import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seededRng, sequenceRng } from '@dt/shared';
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
import { ensureNpc } from '../npc/npc';

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
    // 数值说明随接口下发（问题记录 126）
    expect(d.docs.fields['tuning.settlement.expMultiplier']).toMatch(/经验/);
    expect(d.docs.groups['restaurant']).toBeTruthy();
    expect(d.docs.features.market).toBeTruthy();
    const list = await call(ctx.app, 'GET', S, { cookie: mod.cookie });
    expect(list.json.data.some((s: { id: number }) => s.id === shardId)).toBe(true);
  });

  it('区服列表的餐厅数不含蟹老板', async () => {
    const shardId = await createShard(ctx.deps.db);
    await ensureNpc(ctx.deps.db, testConfig(), testConfig().tuning.friend.npc, shardId, seededRng(1));
    const list = await call(ctx.app, 'GET', S, { cookie: mod.cookie });
    expect(list.json.data.find((x: { id: number }) => x.id === shardId)).toMatchObject({ restaurants: 0 });
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

  it('Redis 广播失败时照常保存成功（backlog 148-4：以前返回 500，管理员重试会再存一版）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const pub = vi.spyOn(ctx.deps.redis, 'publish').mockRejectedValue(new Error('redis down'));
    try {
      const r = await call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: mult(10), note: '广播失败', version: 0 },
      });
      expect(r.status).toBe(200);
      expect(r.json.data).toEqual({ version: 1 });
    } finally {
      pub.mockRestore();
    }
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

  it('配置结构以外的键（拼错的路径、不存在的功能）400 并指出路径', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (override: unknown) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override, note: 'x', version: 0 },
      });
    const typo = await save({ tuning: { settlement: { expMultipler: 10 } } });
    expect(typo.status).toBe(400);
    expect(typo.json.code).toBe('INVALID_CONFIG');
    expect(typo.json.params.issues[0].path).toBe('tuning.settlement.expMultipler');
    const feature = await save({ features: { pnod: false } });
    expect(feature.json.params.issues[0].path).toBe('features.pnod');
    const top = await save({ whatever: 1 });
    expect(top.status).toBe(400);
    expect(
      (await save({ tuning: { settlement: { expMultiplier: 10 } }, features: { market: false } })).status,
    ).toBe(200);
  });

  it('一番赏的奖品引用不存在的道具、图标，或档位叫 last、总张数过多：400（一番赏终审 I3）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (kuji: unknown) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: { tuning: { kuji } }, note: 'x', version: 0 },
      });
    const bad = await save({
      tiers: [{ key: 'A', count: 1, award: { goods: [{ id: 9011, num: 1 }] }, icon: 'nope' }],
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('INVALID_CONFIG');
    const msg = JSON.stringify(bad.json.params.issues);
    expect(msg).toContain('unknown goods 9011');
    expect(msg).toContain('icon nope');
    expect((await save({ tiers: [{ key: 'last', count: 1, award: { coin: 1 } }] })).status).toBe(400);
    expect((await save({ tiers: [{ key: 'X', count: 1001, award: { coin: 1 } }] })).status).toBe(400);
    expect((await save({ tiers: [{ key: 'X', count: 3, award: { coin: 1 } }] })).status).toBe(200);
  });

  it('缺料倾向越界（大于 1、起点高于上限）：400，存不进去（问题记录 50、质量期 ②）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (scarcity: unknown) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: { tuning: { scarcity } }, note: 'x', version: 0 },
      });
    for (const bad of [{ needMax: 1.5 }, { needBase: 0.5, needMax: 0.3 }, { needLuckFactor: -1 }]) {
      const r = await save(bad);
      expect(r.status).toBe(400);
      expect(r.json.code).toBe('INVALID_CONFIG');
    }
    expect((await save({ needBase: 0.1, needMax: 0.4 })).status).toBe(200);
  });

  it('豪华档位改名后月度称号对不上、送券的活跃档不存在：400（质量期 ②）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (kuji: unknown) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: { tuning: { kuji } }, note: 'x', version: 0 },
      });
    // 豪华 A 改叫 S：deluxeMonths 里写的 A 不再是豪华档位，这一档会一直发固定称号
    const renamed = await save({
      deluxe: { tiers: [{ key: 'S', count: 1, award: { diamond: 50 }, icon: 'kuji_dx_a' }] },
    });
    expect(renamed.status).toBe(400);
    expect(JSON.stringify(renamed.json.params.issues)).toContain('deluxeMonths 2026-10 key A is not a deluxe tier');
    // 活跃奖励没有 123 这一档：提示会写一个领不到的档，券也永远送不出去
    const points = await save({ activeTicketPoints: 123 });
    expect(points.status).toBe(400);
    expect(JSON.stringify(points.json.params.issues)).toContain('activeTicketPoints 123');
    expect((await save({ activeTicketPoints: 180 })).status).toBe(200);
  });

  it('小镇发展基金：提前比例大于到期比例、勋章不是荣誉类：400（240-2）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (fund: unknown) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: { tuning: { fund } }, note: 'x', version: 0 },
      });
    const bad = await save({ earlyRate: 0.95, tiers: [{ key: 'C', coin: 1000000, medal: 1 }] });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('INVALID_CONFIG');
    expect(bad.json.params.issues).toEqual([
      { path: 'tuning.fund', message: 'tuning.fund earlyRate 0.95 must not exceed returnRate 0.9' },
      { path: 'tuning.fund', message: 'tuning.fund.tiers C medal 1 is not an honor' },
    ]);
    expect((await save({ tiers: [{ key: 'C', coin: 500000, medal: 93101 }] })).status).toBe(200);
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

describe('区服数值：正在生效的全服加成（backlog 148-4）', () => {
  // 时钟放在 2090 年：插入的全服加成不会落在其他测试的当前时间里
  const FUTURE = new Date('2090-01-01T00:00:00.000Z');
  let fx: TestContext;
  let fxMod: { cookie: string };
  beforeAll(async () => {
    fx = await createTestApp({ now: () => FUTURE });
    fxMod = await userWithRole(fx, 'mod');
  });
  afterAll(() => fx.close());

  it('带上正在生效的全服加成（本区服和全服的，不论建得多早）；不含已结束、别的区服和其他类型', async () => {
    const shardId = await createShard(fx.deps.db);
    const other = await createShard(fx.deps.db);
    const H = 3_600_000;
    const now = FUTURE.getTime();
    const add = async (
      shard: number | null,
      kind: 'boost' | 'goals',
      def: unknown,
      from: number,
      to: number,
    ) =>
      (
        await fx.deps.db
          .insertInto('activity')
          .values({
            shard_id: shard,
            kind,
            title: 't',
            body: 'b',
            starts_at: new Date(now + from * H),
            ends_at: new Date(now + to * H),
            min_level: 1,
            def: JSON.stringify(def),
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
    const exp = { items: [{ key: 'exp', factor: 2 }] };
    const mine = await add(shardId, 'boost', exp, -1, 5);
    const all = await add(null, 'boost', { items: [{ key: 'coin', factor: 1.5 }] }, -1, 5);
    const excluded = [
      await add(other, 'boost', exp, -1, 5),
      await add(shardId, 'boost', exp, -5, -1),
      await add(shardId, 'boost', exp, 1, 5),
      await add(shardId, 'goals', { goals: [] }, -1, 5),
    ];
    const r = await call(fx.app, 'GET', `${S}/${shardId}/settings`, { cookie: fxMod.cookie });
    const ids = (r.json.data.boosts as Array<{ id: number; items: unknown; endsAt: string }>).map(
      (b) => b.id,
    );
    expect(ids.sort()).toEqual([mine, all].sort());
    expect(excluded.some((i) => ids.includes(i))).toBe(false);
    expect(r.json.data.boosts.find((b: { id: number }) => b.id === mine)).toMatchObject({
      items: exp.items,
      endsAt: new Date(now + 5 * H).toISOString(),
    });
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

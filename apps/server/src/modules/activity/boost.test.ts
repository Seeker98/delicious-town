import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import type { AdminActor } from '../admin/access';
import { regenStrength } from '../settlement/strength';
import { createAdminActivity } from './admin';
import { rewardsOf } from './rules';

let t: TestGame;
let actor: AdminActor;
beforeAll(async () => {
  t = await createTestGame();
  actor = { accountId: await createAccountRow(t.db), username: 'boss', role: 'admin', ip: '127.0.0.1' };
});
afterAll(() => t.close());

const H = 3_600_000;
const boost = (factor = 2, key = 'exp') => ({ kind: 'boost' as const, def: { items: [{ key, factor }] } });
const exp = async (shardId: number) =>
  (await t.game.shards.settings(shardId)).tuning.settlement.expMultiplier;
const base = () => t.game.deps.config.tuning.settlement.expMultiplier;

describe('全服加成生效（148-4 设计 §6.2）', () => {
  it('窗口内加成，开始前和结束后都是原值', async () => {
    const shardId = await createShard(t.db);
    const now = t.clock.now.getTime();
    await insertActivity(t, {
      shardId,
      spec: boost(),
      startsAt: new Date(now + H),
      endsAt: new Date(now + 2 * H),
    });
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base());
    t.clock.set(new Date(now + H));
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base() * 2);
    t.clock.set(new Date(now + 2 * H));
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base());
    t.clock.set(new Date(now));
  });

  it('区服 A 的加成不影响区服 B；全服加成两边都生效', async () => {
    const a = await createShard(t.db);
    const b = await createShard(t.db);
    // 全服加成会影响并行跑的其他测试文件：放到 2099 年的窗口里，测完删掉
    const back = t.clock.now;
    const far = new Date('2099-01-01T00:00:00Z').getTime();
    t.clock.set(new Date(far));
    const window = { startsAt: new Date(far - H), endsAt: new Date(far + H) };
    await insertActivity(t, { shardId: a, spec: boost(2), ...window });
    t.game.shards.invalidate(a);
    t.game.shards.invalidate(b);
    expect(await exp(a)).toBe(base() * 2);
    expect(await exp(b)).toBe(base());
    const all = await insertActivity(t, { shardId: null, spec: boost(1.5), ...window });
    try {
      t.game.shards.invalidateAll();
      expect(await exp(a)).toBe(base() * 3);
      expect(await exp(b)).toBe(base() * 1.5);
    } finally {
      await t.db.deleteFrom('activity').where('id', '=', all).execute();
      t.clock.set(back);
      t.game.shards.invalidateAll();
    }
  });

  it('后台建加成后本进程立即生效；提前结束后立即恢复', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    expect(await exp(shardId)).toBe(base());
    const now = t.clock.now.getTime();
    const a = await svc.create(actor, {
      shardId,
      kind: 'boost',
      title: '双倍经验',
      body: '周末',
      startsAt: new Date(now - H).toISOString(),
      endsAt: new Date(now + H).toISOString(),
      minLevel: 1,
      def: { items: [{ key: 'exp', factor: 2 }] },
    });
    expect(await exp(shardId)).toBe(base() * 2);
    await svc.end(actor, a.id);
    expect(await exp(shardId)).toBe(base());
  });

  it('体力恢复任务按加成后的数值恢复', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { strength: 0, strength_max: 100, luck: 0 } });
    await insertActivity(t, { shardId, spec: boost(3, 'strength') });
    t.game.shards.invalidate(shardId);
    await regenStrength(t.game.deps, shardId, 'p1', t.clock.now);
    const row = await t.db
      .selectFrom('restaurant')
      .select('strength')
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    const tn = t.game.deps.config.tuning.strength;
    expect([tn.regen * 3, tn.luckyRegen * 3]).toContain(row.strength);
  });

  it('boost 活动没有奖励，也不计数', async () => {
    expect(rewardsOf(boost(), {}, false)).toEqual([]);
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: boost() });
    await runSystemOp(t.game.deps, shardId, r.restaurantId, { source: 'test' }, (o) =>
      emitAction(o, 'signin'),
    );
    expect(await counters(t, id, r.restaurantId)).toEqual({});
  });

  it('区服关掉限时活动功能时，全服加成也不生效（终审裁定）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { activity: false } }) })
      .execute();
    await insertActivity(t, { shardId, spec: boost(2) });
    t.game.shards.invalidate(shardId);
    expect(await exp(shardId)).toBe(base());
  });
});

describe('backlog 148-4：广播失败不影响保存', () => {
  it('Redis 广播失败：照常建成、只建一条、本进程立即生效，记一条警告日志', async () => {
    const log = { warn: vi.fn() };
    const svc = createAdminActivity(t.game, log);
    const shardId = await createShard(t.db);
    const pub = vi.spyOn(t.game.app.redis, 'publish').mockRejectedValue(new Error('redis down'));
    try {
      const now = t.clock.now.getTime();
      const a = await svc.create(actor, {
        shardId,
        kind: 'boost',
        title: '双倍经验',
        body: '周末',
        startsAt: new Date(now - H).toISOString(),
        endsAt: new Date(now + H).toISOString(),
        minLevel: 1,
        def: { items: [{ key: 'exp', factor: 2 }] },
      });
      expect(a.id).toBeGreaterThan(0);
      expect(await exp(shardId)).toBe(base() * 2);
      expect(log.warn).toHaveBeenCalledTimes(1);
      const n = await t.db
        .selectFrom('activity')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('shard_id', '=', shardId)
        .executeTakeFirstOrThrow();
      expect(Number(n.n)).toBe(1);
    } finally {
      pub.mockRestore();
    }
  });
});

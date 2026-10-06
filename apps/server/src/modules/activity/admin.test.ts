import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActivityInput } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import type { AdminActor } from '../admin/access';
import { createAdminActivity } from './admin';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';

let t: TestGame;
let actor: AdminActor;
beforeAll(async () => {
  t = await createTestGame();
  actor = { accountId: await createAccountRow(t.db), username: 'boss', role: 'admin', ip: '127.0.0.1' };
});
afterAll(() => t.close());

const H = 3_600_000;
const input = (shardId: number, patch: Partial<ActivityInput> = {}): ActivityInput =>
  ({
    shardId,
    kind: 'goals',
    title: '签到',
    body: '说明',
    startsAt: new Date(t.clock.now.getTime() + H).toISOString(),
    endsAt: new Date(t.clock.now.getTime() + 48 * H).toISOString(),
    minLevel: 1,
    def: { goals: [{ key: 'signin', target: 1, award: { coin: 1 } }] },
    ...patch,
  }) as ActivityInput;

describe('后台活动（设计 §5.2）', () => {
  it('开始前全部能改；开始后只能改标题、说明、延长结束时间', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    const a = await svc.create(actor, input(shardId));
    expect(a.state).toBe('pending');
    await svc.update(actor, a.id, input(shardId, { minLevel: 5 }));
    t.clock.advance(2 * H);
    const cur = await svc.one(a.id);
    expect(cur.state).toBe('running');
    const same = input(shardId, { minLevel: 5, startsAt: cur.startsAt, endsAt: cur.endsAt });
    expect((await svc.update(actor, a.id, { ...same, title: '新标题' })).title).toBe('新标题');
    const later = new Date(new Date(cur.endsAt).getTime() + H).toISOString();
    expect((await svc.update(actor, a.id, { ...same, endsAt: later })).endsAt).toBe(later);
    for (const bad of [
      { ...same, minLevel: 6 },
      { ...same, endsAt: new Date(new Date(cur.endsAt).getTime() - H).toISOString() },
      { ...same, def: { goals: [{ key: 'signin', target: 2, award: { coin: 1 } }] } },
      { ...same, shardId: null },
    ])
      await expect(svc.update(actor, a.id, bad as ActivityInput)).rejects.toMatchObject({
        params: { reason: 'locked_after_start' },
      });
    await expect(svc.remove(actor, a.id)).rejects.toMatchObject({ params: { reason: 'started' } });
  });

  it('提前结束把结束时间设为现在；结束后不能再改时间；未开始的能删', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    const a = await svc.create(
      actor,
      input(shardId, { startsAt: new Date(t.clock.now.getTime() - H).toISOString() }),
    );
    const ended = await svc.end(actor, a.id);
    expect(new Date(ended.endsAt).getTime()).toBe(t.clock.now.getTime());
    expect(ended.state).toBe('settling');
    await expect(
      svc.update(
        actor,
        a.id,
        input(shardId, {
          startsAt: ended.startsAt,
          endsAt: new Date(t.clock.now.getTime() + H).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ params: { reason: 'ended' } });
    await expect(svc.end(actor, a.id)).rejects.toMatchObject({ params: { reason: 'not_running' } });
    const b = await svc.create(actor, input(shardId));
    await svc.remove(actor, b.id);
    expect((await svc.list()).map((x) => x.id)).not.toContain(b.id);
  });

  it('区服不存在 NOT_FOUND', async () => {
    const svc = createAdminActivity(t.game);
    await expect(svc.create(actor, input(2_147_000_000))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('进行中的活动定义里有（上线后才）下架的道具：定义没改时仍能延长结束时间（backlog #143）', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    const a = await svc.create(actor, input(shardId));
    const retired = testConfig().bundle.goods.find((g) => g.retired)!;
    const def = { goals: [{ key: 'signin', target: 1, award: { goods: [{ id: retired.id, num: 1 }] } }] };
    await t.db
      .updateTable('activity')
      .set({ def: JSON.stringify(def) })
      .where('id', '=', a.id)
      .execute();
    t.clock.advance(2 * H);
    const cur = await svc.one(a.id);
    const later = new Date(new Date(cur.endsAt).getTime() + H).toISOString();
    const same = input(shardId, { startsAt: cur.startsAt, endsAt: later, def } as Partial<ActivityInput>);
    expect((await svc.update(actor, a.id, same)).endsAt).toBe(later);
  });

  it('定义里的道具、食材 id 必须存在：新建、修改都检查，报带路径的字段错误（backlog 148-2）', async () => {
    const svc = createAdminActivity(t.game);
    const shardId = await createShard(t.db);
    const def = {
      goals: [
        { key: 'signin', target: 1, award: { goods: [{ id: gid('金币'), num: 1 }] } },
        {
          key: 'signin',
          target: 2,
          award: { goods: [{ id: 999_999, num: 1 }], foods: [{ id: 888_888, num: 2 }] },
        },
      ],
    };
    const err = {
      code: 'VALIDATION_FAILED',
      params: {
        issues: [
          { path: 'def.goals.1.award.goods.0.id', message: 'unknown' },
          { path: 'def.goals.1.award.foods.0.id', message: 'unknown' },
        ],
      },
    };
    await expect(svc.create(actor, input(shardId, { def } as Partial<ActivityInput>))).rejects.toMatchObject(
      err,
    );
    const a = await svc.create(actor, input(shardId));
    await expect(
      svc.update(actor, a.id, input(shardId, { def } as Partial<ActivityInput>)),
    ).rejects.toMatchObject(err);
    // 战令的解锁价格里的道具也查
    const pass = {
      kind: 'pass',
      def: {
        rules: [{ key: 'signin', points: 1, dailyCap: 1 }],
        levels: [{ points: 10, free: { coin: 1 }, premium: null }],
        unlock: { goods: [{ id: 777_777, num: 1 }] },
      },
    } as Partial<ActivityInput>;
    await expect(svc.create(actor, input(shardId, pass))).rejects.toMatchObject({
      params: { issues: [{ path: 'def.unlock.goods.0.id', message: 'unknown' }] },
    });
  });
});

describe('后台活动（HTTP）', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('版主能读不能写；管理员写操作有审计；def 错误带路径', async () => {
    const mod = await userWithRole(ctx, 'mod');
    const admin = await userWithRole(ctx, 'admin');
    const shardId = await createShard(ctx.deps.db);
    const now = Date.now();
    const body = {
      shardId,
      kind: 'goals',
      title: '签到',
      body: '说明',
      startsAt: new Date(now + H).toISOString(),
      endsAt: new Date(now + 2 * H).toISOString(),
      minLevel: 1,
      def: { goals: [{ key: 'signin', target: 1, award: { coin: 1 } }] },
    };
    expect((await call(ctx.app, 'GET', '/api/v1/admin/activities', { cookie: mod.cookie })).status).toBe(200);
    expect(
      (await call(ctx.app, 'POST', '/api/v1/admin/activities', { cookie: mod.cookie, body })).status,
    ).toBe(404);
    const bad = await call(ctx.app, 'POST', '/api/v1/admin/activities', {
      cookie: admin.cookie,
      body: { ...body, def: { goals: [{ key: 'signin', target: 0, award: { coin: 1 } }] } },
    });
    expect(bad.json.params.issues.map((i: { path: string }) => i.path)).toContain('def.goals.0.target');
    const c = await call(ctx.app, 'POST', '/api/v1/admin/activities', { cookie: admin.cookie, body });
    const id = c.json.data.id as number;
    await call(ctx.app, 'POST', `/api/v1/admin/activities/${id}`, {
      cookie: admin.cookie,
      body: { ...body, title: '改' },
    });
    await call(ctx.app, 'POST', `/api/v1/admin/activities/${id}/delete`, { cookie: admin.cookie, body: {} });
    const actions = (
      await ctx.deps.db
        .selectFrom('audit_log')
        .select('action')
        .where('target', '=', `activity:${id}`)
        .execute()
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['activity.create', 'activity.delete', 'activity.update']);
  });
});

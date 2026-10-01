import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LaunchCheckDto } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('上线检查（设计 §7）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let shardId: number;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    shardId = await createShard(ctx.deps.db);
  });
  afterAll(() => ctx.close());
  const get = (cookie: string) => call(ctx.app, 'GET', '/api/v1/admin/launch-check', { cookie });
  const mine = (dto: LaunchCheckDto) => dto.shards.find((s) => s.shardId === shardId)!;

  it('默认值下列出没通过的项；修复只改这几项，保留其他覆盖（Review Focus 3）', async () => {
    const pre = await call(ctx.app, 'POST', `/api/v1/admin/shards/${shardId}/override`, {
      cookie: admin.cookie,
      body: { override: { tuning: { hiphop: { hour: 10 } } }, note: '原有覆盖', version: 0 },
    });
    expect(pre.status).toBe(200);
    const r = await get(mod.cookie);
    const s = mine(r.json.data);
    expect(s.items.filter((i: { ok: boolean }) => !i.ok).map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining([
        'tuning.hiphop.requireVerifiedEmail',
        'tuning.town.shake.limitIp',
        'tuning.town.shake.limitDevice',
      ]),
    );
    const fix = await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', {
      cookie: admin.cookie,
      body: { shardId, version: s.version },
    });
    expect(fix.status).toBe(200);
    expect(mine(fix.json.data).items.every((i: { ok: boolean }) => i.ok)).toBe(true);
    const settings = await call(ctx.app, 'GET', `/api/v1/admin/shards/${shardId}/settings`, {
      cookie: admin.cookie,
    });
    expect(settings.json.data.override.tuning.hiphop).toMatchObject({ hour: 10, requireVerifiedEmail: true });
    const hist = await call(ctx.app, 'GET', `/api/v1/admin/shards/${shardId}/history`, {
      cookie: admin.cookie,
    });
    expect(hist.json.data[0].note).toBe('上线检查');
  });

  it('协管不能修复；版本过期报 409（Review Focus 4）', async () => {
    const s = mine((await get(mod.cookie)).json.data);
    expect(
      (
        await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', {
          cookie: mod.cookie,
          body: { shardId, version: s.version },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', {
          cookie: admin.cookie,
          body: { shardId, version: s.version - 1 },
        })
      ).status,
    ).toBe(409);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACH_PERFECT_ICON } from '@dt/config';
import type { GameEvent } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createLooks } from '../friend/looks';
import { awardAchievements, crossedMilestones } from './award';
import { achValues } from './metrics';
import { evaluateRest } from './service';

/** 成就 PR③：头像框、成就点里程碑、绝版成就 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const cfg = () => t.game.deps.config;
const tuning = () => cfg().tuning.achieve;

async function setPoints(restId: number, points: number, at = new Date('2026-10-01T00:00:00Z')) {
  await t.db.insertInto('rest_ach').values({ rest_id: restId, points, points_at: at }).execute();
}
async function stat(restId: number) {
  return t.db.selectFrom('rest_ach').selectAll().where('rest_id', '=', restId).executeTakeFirst();
}
async function icons(restId: number) {
  return (await t.db.selectFrom('rest_icon').select('icon_key').where('rest_id', '=', restId).execute()).map(
    (x) => x.icon_key,
  );
}
const award = (r: { shardId: number; restaurantId: number }, ids: string[], events?: GameEvent[]) =>
  awardAchievements(t.db, cfg(), tuning(), {
    shardId: r.shardId,
    restId: r.restaurantId,
    ids,
    now: t.clock.now,
    backfilled: false,
    events,
  });

describe('成就点里程碑', () => {
  it('配置：六个头像框按成就点从小到大，12,000 点的那个一起给「成就大师」', () => {
    const frames = cfg().bundle.looks.frames;
    expect(frames.map((f) => f.points)).toEqual([500, 1500, 3000, 5000, 8000, 12000]);
    expect(frames.at(-1)!.icon).toBe('ach-master');
    expect(crossedMilestones(cfg(), 490, 1600).map((m) => m.frame)).toEqual([1, 2]);
    const total = cfg().achievements.totalPts;
    expect(crossedMilestones(cfg(), total - 1, total)).toEqual([
      { points: total, frame: null, icon: ACH_PERFECT_ICON },
    ]);
  });

  it('跨过 500 点：写动态、弹提示（头像框不自动戴）', async () => {
    const r = await newRestaurant(t);
    await setPoints(r.restaurantId, 495);
    const events: GameEvent[] = [];
    await award(r, ['roach.1'], events);
    expect((await stat(r.restaurantId))!.points).toBe(505);
    expect(events).toContainEqual({ type: 'gain', kind: 'achFrame', id: 1, num: 500 });
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'achieve.milestone')
      .execute();
    expect(log.map((x) => x.params)).toEqual([{ points: 500, frame: 1 }]);
    const rest = await t.db
      .selectFrom('restaurant')
      .select('frame')
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    expect(rest.frame).toBeNull();
  });

  it('跨过 12,000 点给「成就大师」；计点成就全部达成给「小镇完人」', async () => {
    const r = await newRestaurant(t);
    await setPoints(r.restaurantId, 11_995);
    await award(r, ['roach.1']);
    expect(await icons(r.restaurantId)).toContain('ach-master');
    const r2 = await newRestaurant(t);
    await setPoints(r2.restaurantId, cfg().achievements.totalPts - 10);
    await award(r2, ['roach.1']);
    expect(await icons(r2.restaurantId)).toContain(ACH_PERFECT_ICON);
  });
});

describe('绝版成就', () => {
  it('不计点：成就点、达到当前点数的时间都不动', async () => {
    const r = await newRestaurant(t);
    const at = new Date('2026-10-01T00:00:00Z');
    await setPoints(r.restaurantId, 100, at);
    expect(await award(r, ['veteran.1'])).toEqual(['veteran.1']);
    const s = (await stat(r.restaurantId))!;
    expect(s.points).toBe(100);
    expect(s.points_at!.getTime()).toBe(at.getTime());
    const row = await t.db
      .selectFrom('rest_achievement')
      .select('pts')
      .where('rest_id', '=', r.restaurantId)
      .where('ach_id', '=', 'veteran.1')
      .executeTakeFirstOrThrow();
    expect(row.pts).toBe(0);
  });

  it('开服元老按开店时间；节油器改版亲历按领过补偿邮件', async () => {
    const r = await newRestaurant(t);
    await t.db
      .updateTable('restaurant')
      .set({ created_at: new Date('2026-10-05T00:00:00Z') })
      .where('id', '=', r.restaurantId)
      .execute();
    const late = await newRestaurant(t);
    await t.db
      .updateTable('restaurant')
      .set({ created_at: new Date('2026-11-02T00:00:00Z') })
      .where('id', '=', late.restaurantId)
      .execute();
    const mail = await t.db
      .insertInto('mail')
      .values({
        scope: 'shard',
        shard_id: r.shardId,
        title: 'x',
        body: 'x',
        tpl: 'oilsaver.revamp',
        source: 'oilsaver.revamp',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('mail_state')
      .values({ mail_id: mail.id, rest_id: r.restaurantId, claimed_at: new Date() })
      .execute();
    const values = async (id: number) => {
      const rest = await t.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return achValues(t.db, cfg(), rest, t.clock.now);
    };
    const v = await values(r.restaurantId);
    expect(v.get('state:legacy:veteran')).toBe(1);
    expect(v.get('state:legacy:oilsaver')).toBe(1);
    const w = await values(late.restaurantId);
    expect(w.get('state:legacy:veteran')).toBe(0);
    expect(w.get('state:legacy:oilsaver')).toBe(0);
  });
});

describe('戴头像框', () => {
  it('成就点够了才能戴；0 是不戴；装扮页带上戴的框和成就点', async () => {
    const r = await newRestaurant(t);
    const looks = createLooks(t.game.deps);
    await expect(looks.frame(r, 1)).rejects.toThrow();
    await setPoints(r.restaurantId, 1600);
    await expect(looks.frame(r, 3)).rejects.toThrow();
    expect((await looks.frame(r, 2)).data).toEqual({ frame: 2 });
    const mine = await looks.mine(r);
    expect(mine).toMatchObject({ frame: 2, achPoints: 1600 });
    expect((await looks.frame(r, 0)).data).toEqual({ frame: null });
    expect((await looks.mine(r)).frame).toBeNull();
    await expect(looks.frame(r, 99)).rejects.toThrow();
  });
});

describe('补发时补上里程碑称号', () => {
  it('上线以前就过了 12,000 点的店：补发时补发「成就大师」', async () => {
    const r = await newRestaurant(t);
    await setPoints(r.restaurantId, 12_500);
    const rest = await t.db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    await evaluateRest(t.db, cfg(), tuning(), rest, { now: t.clock.now, backfilled: true });
    expect(await icons(r.restaurantId)).toContain('ach-master');
  });
});

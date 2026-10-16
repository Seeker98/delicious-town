import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../../test/game';
import { createAutoEvents, resolveAutoEvents } from './index';
import { market } from './market';

afterEach(() => vi.restoreAllMocks());
const log = { error: vi.fn(), info: vi.fn() };

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const DAY = '2026-11-03';
const at0 = gameTime(DAY, 0, 5);
/** 当天许愿树那一轮开了，结的是 goods */
const wishRound = (shardId: number, goods: number) =>
  t.db
    .insertInto('wish_round')
    .values({
      shard_id: shardId,
      day: DAY,
      goods_id: goods,
      num: 1,
      opens_at: gameTime(DAY, 20),
      ends_at: gameTime('2026-11-04', 20),
    })
    .execute();
const events = (shardId: number) =>
  t.db.selectFrom('predict_event').selectAll().where('shard_id', '=', shardId).orderBy('id').execute();

describe('出题任务（238-2 设计 §5.2）', () => {
  it('每类一题，auto_key 为 <开关>:D；重跑不重复出题（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const first = await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    expect(first.created.sort()).toEqual(['krab', 'market', 'weather', 'wish']);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(2));
    const rows = await events(shardId);
    expect(rows.map((r) => r.auto_key).sort()).toEqual([
      `krab:${DAY}`,
      `market:${DAY}`,
      `weather:${DAY}`,
      `wish:${DAY}`,
    ]);
    expect(rows.every((r) => r.created_by === null && r.b === 100 && r.status === 'open')).toBe(true);
    // 2026-11-03 是单数日：出蟹老板题
    expect(rows.find((r) => r.auto_key === `krab:${DAY}`)!.kind).toBe('krab');
  });

  it('双数日也出蟹老板题（嘻哈男孩已删，天气改版 PR③）；关掉开关不出这一类', async () => {
    const even = '2026-11-04';
    const s1 = await createShard(t.db);
    await createAutoEvents(t.game.deps, s1, gameTime(even, 0, 5), seededRng(1));
    expect((await events(s1)).find((r) => r.auto_key === `krab:${even}`)!.kind).toBe('krab');
    const s2 = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: s2,
        override: JSON.stringify({
          tuning: { predict: { auto: { market: false, weather: false } } },
        }),
      })
      .execute();
    t.game.shards.invalidate(s2);
    const r = await createAutoEvents(t.game.deps, s2, gameTime(even, 0, 5), seededRng(1));
    expect(r.created.sort()).toEqual(['krab', 'wish']);
  });
});

describe('判定任务（238-2 设计 §5.3）', () => {
  it('到判定时间写结果和判定依据；没到的不动', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const w = (await events(shardId)).find((r) => r.kind === 'wish')!;
    const goods = Number((w.params as { goods: number }).goods);
    await wishRound(shardId, goods);
    expect(await resolveAutoEvents(t.game.deps, shardId, new Date(w.resolve_at!.getTime() - 1))).toEqual({
      resolved: 0,
      voided: 0,
    });
    const res = await resolveAutoEvents(t.game.deps, shardId, w.resolve_at!);
    expect(res.resolved).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === w.id)!;
    expect(after).toMatchObject({ status: 'resolved', outcome: true });
    expect(after.result_note).toBe(`11月3日许愿树结的是${t.game.deps.config.goods.get(goods)!.name} ×1`);
    // 判定依据的参数存下来，前端按语言渲染（问题记录 272）
    expect(after.result_params).toEqual({ day: DAY, goods, num: 1 });
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'predict.result')
      .executeTakeFirstOrThrow();
    expect(news.params).toMatchObject({ kind: 'wish', eventParams: { goods } });
  });

  it('已手动判定或作废的不覆盖（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const w = (await events(shardId)).find((r) => r.kind === 'wish')!;
    await wishRound(shardId, Number((w.params as { goods: number }).goods));
    await t.db
      .updateTable('predict_event')
      .set({ status: 'resolved', outcome: false, resolved_at: at0 })
      .where('id', '=', w.id)
      .execute();
    await resolveAutoEvents(t.game.deps, shardId, w.resolve_at!);
    const after = (await events(shardId)).find((r) => r.id === w.id)!;
    expect(after).toMatchObject({ outcome: false, result_note: null });
  });

  it('过了判定时间 24 小时还判不了：自动作废，判定依据写数据缺失', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const m = (await events(shardId)).find((r) => r.kind === 'market')!;
    const late = new Date(m.resolve_at!.getTime() + 24 * 3_600_000);
    const res = await resolveAutoEvents(t.game.deps, shardId, late);
    expect(res.voided).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === m.id)!;
    expect(after).toMatchObject({
      status: 'void',
      result_note: '数据缺失, 自动作废',
      result_params: { void: 'missing' },
      void_ratio: 1,
    });
  });
});

describe('出错隔离（终审 I2）', () => {
  it('某一类出题报错：记日志，其他类照常出', async () => {
    const shardId = await createShard(t.db);
    vi.spyOn(market, 'create').mockRejectedValue(new Error('boom'));
    const r = await createAutoEvents(t.game.deps, shardId, at0, seededRng(1), log);
    expect(r.created.sort()).toEqual(['krab', 'weather', 'wish']);
    expect(log.error).toHaveBeenCalled();
  });

  it('某个事件判定一直报错：不挡住后面的事件；过了 24 小时照样自动作废', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const all = await events(shardId);
    const m = all.find((r) => r.kind === 'market')!;
    const s = all.find((r) => r.kind === 'wish')!;
    await wishRound(shardId, Number((s.params as { goods: number }).goods));
    vi.spyOn(market, 'resolve').mockRejectedValue(new Error('boom'));
    const later = new Date(Math.max(m.resolve_at!.getTime(), s.resolve_at!.getTime()));
    const r1 = await resolveAutoEvents(t.game.deps, shardId, later, log);
    expect(r1.resolved).toBeGreaterThanOrEqual(1);
    expect((await events(shardId)).find((r) => r.id === s.id)!.status).toBe('resolved');
    const r2 = await resolveAutoEvents(
      t.game.deps,
      shardId,
      new Date(m.resolve_at!.getTime() + 24 * 3_600_000),
      log,
    );
    expect(r2.voided).toBeGreaterThanOrEqual(1);
    expect((await events(shardId)).find((r) => r.id === m.id)!.status).toBe('void');
  });

  it('删掉的题型（全服营业银币 2026-10-16、嘻哈男孩）：不等判定时间，立刻作废退款', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const all = await events(shardId);
    const m = all.find((r) => r.kind === 'market')!;
    const k = all.find((r) => r.kind === 'krab')!;
    await t.db.updateTable('predict_event').set({ kind: 'stats' }).where('id', '=', m.id).execute();
    await t.db.updateTable('predict_event').set({ kind: 'hiphop' }).where('id', '=', k.id).execute();
    const r = await resolveAutoEvents(t.game.deps, shardId, at0);
    expect(r).toEqual({ resolved: 0, voided: 2 });
    for (const id of [m.id, k.id])
      expect((await events(shardId)).find((x) => x.id === id)).toMatchObject({
        status: 'void',
        result_note: '题型下线, 自动作废',
        result_params: { void: 'retired' },
        void_ratio: 1,
      });
    // 别的题照常等判定时间
    expect((await events(shardId)).filter((x) => x.status === 'open')).toHaveLength(2);
  });
});

describe('出题的兜底和日志（backlog 238-2）', () => {
  it('出不了的一类写日志', async () => {
    const even = '2026-11-04';
    const shardId = await createShard(t.db);
    vi.spyOn(market, 'create').mockResolvedValueOnce(null);
    const r = await createAutoEvents(t.game.deps, shardId, gameTime(even, 0, 5), seededRng(1), log);
    expect(r.created.sort()).toEqual(['krab', 'weather', 'wish']);
    expect((await events(shardId)).find((x) => x.auto_key === `krab:${even}`)!.kind).toBe('krab');
    expect(log.info).toHaveBeenCalledWith({ shardId, flag: 'market' }, 'predict auto skipped');
  });
});

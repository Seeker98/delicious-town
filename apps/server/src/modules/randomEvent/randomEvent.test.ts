import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(7) });
});
afterAll(() => t.close());

const svc = () => t.game.randomEvent;

/** 开了随机事件的区服；tuning 覆盖 randomEvents 段 */
async function shardOn(tuning: Record<string, unknown> = {}, on = true): Promise<number> {
  const shardId = await createShard(t.db);
  await t.db
    .insertInto('shard_config')
    .values({
      shard_id: shardId,
      override: JSON.stringify({ features: { randomEvents: on }, tuning: { randomEvents: tuning } }),
    })
    .execute();
  t.game.shards.invalidate(shardId);
  return shardId;
}

async function rest(shardId: number, patch: Record<string, unknown> = {}): Promise<RestCtx> {
  return newRestaurant(t, { shardId, patch: { level: 20, coin: 100_000, ...patch } });
}

/** 直接放一件挂着的（绕开随机抽） */
async function put(
  r: RestCtx,
  kind: 'choice' | 'quiz' | 'quizNight',
  refId: number,
  payload?: unknown,
  expiresInMs = 3600_000,
): Promise<string> {
  const now = t.clock.now;
  const row = await t.db
    .insertInto('random_event')
    .values({
      rest_id: r.restaurantId,
      slot: `test#${Math.random()}`,
      kind,
      ref_id: refId,
      status: 'pending',
      payload: payload === undefined ? null : JSON.stringify(payload),
      created_at: now,
      expires_at: new Date(now.getTime() + expiresInMs),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

const rows = (r: RestCtx) =>
  t.db.selectFrom('random_event').selectAll().where('rest_id', '=', r.restaurantId).orderBy('id').execute();

describe('随机事件: 什么时候出（设计稿 §3）', () => {
  it('区服没开: 返回空, 不写记录', async () => {
    const shardId = await shardOn({}, false);
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-02', 10, 0));
    expect((await svc().current(r, 'zh-CN')).data.event).toBeNull();
    expect(await rows(r)).toEqual([]);
  });

  it('同一时段只抽一次; 看过通知或答完以后这一段不再出, 下一时段再抽', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-02', 9, 0));
    const first = (await svc().current(r, 'zh-CN')).data.event;
    expect(first).not.toBeNull();
    // 再问一次: 还是同一件
    expect((await svc().current(r, 'zh-CN')).data.event?.id).toBe(first!.id);
    // 了结它
    if (first!.kind === 'notice') await svc().seen(r, first!.id);
    else if (first!.kind === 'choice') await svc().choose(r, first!.id, 'a', 'zh-CN');
    else await svc().answer(r, first!.id, { index: 0 }, 'zh-CN');
    if (first!.kind === 'quizNight') {
      await svc().answer(r, first!.id, { index: 0 }, 'zh-CN');
      await svc().answer(r, first!.id, { index: 0 }, 'zh-CN');
    }
    t.clock.set(gameTime('2026-11-02', 11, 59));
    expect((await svc().current(r, 'zh-CN')).data.event).toBeNull();
    expect(await rows(r)).toHaveLength(1);
    t.clock.set(gameTime('2026-11-02', 12, 0));
    expect((await svc().current(r, 'zh-CN')).data.event).not.toBeNull();
    expect((await rows(r)).map((x) => x.slot)).toEqual(['2026-11-02#2', '2026-11-02#3']);
  });

  it('quizShare = 1 时出问答; 答案不在返回里, 选项是打乱后的顺序', async () => {
    const shardId = await shardOn({ quizShare: 1 });
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-03', 15, 0));
    const e = (await svc().current(r, 'en')).data.event!;
    expect(e.kind).toBe('quiz');
    expect(e.status).toBe('pending');
    const q = e.questions![0]!;
    expect(q.answer).toBeNull();
    expect(q.explain).toBeNull();
    expect(JSON.stringify(e)).not.toContain('"answer":0');
  });

  it('挂着超时作废, 不给东西; 下一次打开时作废并照常抽这一时段', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-04', 9, 0));
    const id = await put(r, 'choice', 7, undefined, 60_000);
    t.clock.advance(120_000);
    await expect(svc().choose(r, id, 'a', 'zh-CN')).rejects.toMatchObject({
      params: { reason: 'random_event_expired' },
    });
    expect((await rows(r))[0]!.status).toBe('pending');
    // 下一次打开时作废；这一时段（9 点那段）还没抽过，接着抽一件新的
    const next = (await svc().current(r, 'zh-CN')).data.event;
    const all = await rows(r);
    expect(all[0]!.status).toBe('expired');
    expect(all).toHaveLength(2);
    expect(next!.id).toBe(all[1]!.id);
    expect(all[0]!.outcome).toBeNull();
  });
});

describe('随机事件: 选择 (设计稿 §5)', () => {
  it('一箱空瓶 a: 银币 = 等级 × 20; 再选报 ALREADY_DONE', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-05', 9, 0));
    const before = (await restRow(t, r.restaurantId)).coin;
    const id = await put(r, 'choice', 7);
    const e = (await svc().choose(r, id, 'a', 'zh-CN')).data;
    expect(e.status).toBe('done');
    expect(e.chosen).toBe('a');
    expect(e.result).toMatchObject({ text: '退了一小把银币。', reward: { coin: 400 } });
    expect((await restRow(t, r.restaurantId)).coin).toBe(before + 400);
    await expect(svc().choose(r, id, 'b', 'zh-CN')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('一箱空瓶 b: 挂上 3 小时的上座率 +5%, 到期时间写在结果里', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-05', 10, 0));
    const id = await put(r, 'choice', 7);
    const e = (await svc().choose(r, id, 'b', 'en')).data;
    const src = await t.db
      .selectFrom('effect_source')
      .selectAll()
      .where('rest_id', '=', r.restaurantId)
      .where('source_type', '=', 'randomEvent')
      .executeTakeFirstOrThrow();
    expect(src.source_id).toBe(7);
    expect(src.effects).toEqual({ atRate: 0.05 });
    expect(src.expires_at!.getTime()).toBe(t.clock.now.getTime() + 3 * 3600_000);
    expect(e.result!.until).toBe(src.expires_at!.toISOString());
    // 英文按翻译给
    expect(e.title).not.toBe('一箱空瓶');
  });

  it('旧货摊的锅: 花 银币 = 等级; 钱不够报 NOT_ENOUGH, 不了结', async () => {
    const shardId = await shardOn();
    const poor = await rest(shardId, { coin: 5 });
    t.clock.set(gameTime('2026-11-05', 11, 0));
    const id = await put(poor, 'choice', 16);
    const view = (await svc().current(poor, 'zh-CN')).data.event!;
    expect(view.options!.map((o) => o.cost)).toEqual([20, null]);
    await expect(svc().choose(poor, id, 'a', 'zh-CN')).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect((await rows(poor))[0]!.status).toBe('pending');
    await svc().choose(poor, id, 'b', 'zh-CN');
    expect((await rows(poor))[0]!.status).toBe('done');
  });
});

describe('随机事件: 问答 (设计稿 §7)', () => {
  it('答对给 1 张神秘礼券, 返回正确选项和解说; 再答报 ALREADY_DONE', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-06', 9, 0));
    // 题 1 的正确答案原下标 0，显示在第 2 个
    const id = await put(r, 'quiz', 1, { qs: [{ id: 1, order: [2, 0, 1, 3], picked: null, correct: null }] });
    const before = await goodsNum(t, r.restaurantId, GOODS.mysteryTicket);
    const e = (await svc().answer(r, id, { index: 1 }, 'zh-CN')).data;
    const q = e.questions![0]!;
    expect(q).toMatchObject({ picked: 1, answer: 1, correct: true });
    expect(q.choices[1]).toBe('大风');
    expect(q.explain).toContain('飓风');
    expect(e.result!.reward!.tickets).toBe(1);
    expect(await goodsNum(t, r.restaurantId, GOODS.mysteryTicket)).toBe(before + 1);
    await expect(svc().answer(r, id, { index: 0 }, 'zh-CN')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('答错给经验 = 等级 × 5, 不给券', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-06', 10, 0));
    const id = await put(r, 'quiz', 1, { qs: [{ id: 1, order: [0, 1, 2, 3], picked: null, correct: null }] });
    const e = (await svc().answer(r, id, { index: 3 }, 'zh-CN')).data;
    expect(e.questions![0]).toMatchObject({ correct: false, answer: 0 });
    expect(e.result!.reward).toMatchObject({ exp: 100, tickets: 0 });
  });

  it('没有对错的题按选的答案给效果', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-06', 11, 0));
    const id = await put(r, 'quiz', 11, { qs: [{ id: 11, order: [2, 1, 0], picked: null, correct: null }] });
    const e = (await svc().answer(r, id, { index: 0 }, 'zh-CN')).data; // 显示第 1 个是“醋”
    expect(e.questions![0]).toMatchObject({ correct: null, answer: null });
    expect(e.result!.effects).toEqual({ coinRate: 0.03 });
    const src = await t.db
      .selectFrom('effect_source')
      .select('source_id')
      .where('rest_id', '=', r.restaurantId)
      .where('source_type', '=', 'randomEvent')
      .executeTakeFirstOrThrow();
    expect(src.source_id).toBe(1011);
  });

  it('问答夜: 三道答完按答对几道发奖, 全对 3 张', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-05', 20, 0));
    const qs = [1, 2, 3].map((id) => ({ id, order: [0, 1, 2, 3], picked: null, correct: null }));
    const id = await put(r, 'quizNight', 40, { qs });
    const before = await goodsNum(t, r.restaurantId, GOODS.mysteryTicket);
    expect((await svc().answer(r, id, { index: 0, q: 0 }, 'zh-CN')).data.status).toBe('pending');
    await svc().answer(r, id, { index: 0, q: 1 }, 'zh-CN');
    const e = (await svc().answer(r, id, { index: 0, q: 2 }, 'zh-CN')).data;
    expect(e.status).toBe('done');
    expect(e.result!.text).toContain('全部答对');
    expect(await goodsNum(t, r.restaurantId, GOODS.mysteryTicket)).toBe(before + 3);
  });

  it('问答夜超时: 已答的按答对几道结算, 下次打开给玩家看结果', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-05', 21, 0));
    const qs = [1, 2, 3].map((id) => ({ id, order: [0, 1, 2, 3], picked: null, correct: null }));
    const id = await put(r, 'quizNight', 40, { qs }, 60_000);
    await svc().answer(r, id, { index: 0, q: 0 }, 'zh-CN');
    t.clock.advance(120_000);
    const e = (await svc().current(r, 'zh-CN')).data.event!;
    expect(e.id).toBe(id);
    expect(e.status).toBe('done');
    expect(e.result!.text).toContain('答对了一道');
  });
});

describe('随机事件: 配置里删掉的事件和题', () => {
  const GONE = 99_999;

  it('挂着的、没看过结果的找不到配置: 收掉这一行, 照常抽这一时段 (不能让这家店从此不出事件)', async () => {
    const shardId = await shardOn();
    const r = await rest(shardId);
    t.clock.set(gameTime('2026-11-06', 9, 0));
    await put(r, 'choice', GONE);
    const next = (await svc().current(r, 'zh-CN')).data.event;
    const all = await rows(r);
    expect(all[0]!.status).toBe('expired');
    expect(all).toHaveLength(2);
    expect(next!.id).toBe(all[1]!.id);

    // 已了结、没看过的（通知、超时结算的问答夜）：记成看过
    const r2 = await rest(shardId);
    const id = await put(r2, 'choice', GONE);
    await t.db
      .updateTable('random_event')
      .set({ status: 'done', seen: false })
      .where('id', '=', id)
      .execute();
    expect((await svc().current(r2, 'zh-CN')).data.event).not.toBeNull();
    expect((await rows(r2))[0]!.seen).toBe(true);
  });

  it('题被删了: 问答、问答夜都不报错, 收掉后照常抽', async () => {
    const shardId = await shardOn();
    t.clock.set(gameTime('2026-11-06', 13, 0));
    const r = await rest(shardId);
    await put(r, 'quiz', GONE, { qs: [{ id: GONE, order: [0, 1], picked: null, correct: null }] });
    expect((await svc().current(r, 'zh-CN')).data.event).not.toBeNull();
    expect((await rows(r))[0]!.status).toBe('expired');

    const r2 = await rest(shardId);
    const qs = [1, GONE, 3].map((id) => ({ id, order: [0, 1, 2, 3], picked: null, correct: null }));
    await put(r2, 'quizNight', 40, { qs });
    expect((await svc().current(r2, 'zh-CN')).data.event).not.toBeNull();
    expect((await rows(r2))[0]!.status).toBe('expired');
  });
});

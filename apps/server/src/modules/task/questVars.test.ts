import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { showQuest } from '../../../test/quests';
import { questVars } from './rules';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('任务名里的数跟着区服数值走（515 支线扩充 B 遗留：好感 35、邀请 10 / 30 级、持有 200 份原来写死）', () => {
  it('名字里写了 {n} 的任务都有数，有数的任务名字里都写了 {n}', () => {
    const tuning = t.deps.config.tuning;
    const bad = t.deps.config.bundle.quests
      .filter((q) => q.name.includes('{n}') !== (questVars(q.cond.key, tuning) !== undefined))
      .map((q) => `${q.id} ${q.name}`);
    expect(bad).toEqual([]);
    expect(t.deps.config.bundle.quests.filter((q) => q.name.includes('{n}')).length).toBe(5);
  });

  it('默认数值：好感 35、持有 100 和 200 份、邀请 10 级和 30 级', () => {
    const tuning = t.deps.config.tuning;
    expect(
      ['kraken.favorHigh', 'predict.hold100', 'predict.hold200', 'invite.level10', 'invite.level30'].map(
        (k) => questVars(k, tuning)?.n,
      ),
    ).toEqual([35, 100, 200, 10, 30]);
  });

  it('区服改了好感门槛、持有上限：任务列表里带的数跟着变', async () => {
    const ctx = await newRestaurant(t);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: ctx.shardId,
        override: JSON.stringify({ tuning: { temple: { tentacleFavor: 50 }, predict: { maxHold: 150 } } }),
      })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    const kraken = t.deps.config.bundle.quests.find((q) => q.cond.key === 'kraken.favorHigh')!;
    await showQuest(t, ctx.restaurantId, kraken.id);
    const line = (await t.game.task.tasks(ctx)).lines.find((l) => l.id === kraken.line);
    expect(line?.quest).toMatchObject({ id: kraken.id, vars: { n: 50 } });
    const tuning = (await t.game.shards.settings(ctx.shardId)).tuning;
    expect(questVars('predict.hold200', tuning)).toEqual({ n: 150 });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { rollHiphopDay } from './day';

let script = [0.1];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script) });
});
afterAll(() => t.close());

describe('嘻哈男孩的地点不能由区服号和日期推算（终审 I1）', () => {
  it('地点由服务端随机源决定，同一区服同一天换个随机数结果就不同', async () => {
    const weights = [
      [1, 1],
      [2, 1],
    ];
    const a = await createShard(t.db);
    await setTuning(t, a, { hiphop: { placeWeights: weights } });
    script = [0.1];
    expect((await rollHiphopDay(t.game.deps, a, '2026-10-01', gameTime('2026-10-01', 9))).place).toBe(1);
    const b = await createShard(t.db);
    await setTuning(t, b, { hiphop: { placeWeights: weights } });
    script = [0.9];
    expect((await rollHiphopDay(t.game.deps, b, '2026-10-01', gameTime('2026-10-01', 9))).place).toBe(2);
  });
});

import { afterAll, beforeAll, it } from 'vitest';
import type { TestGame } from '../../../test/game';
import { barOdds } from './bar';
import { equipOdds } from './equip';
import { oddsGame, writeReport } from './harness';
import { kujiOdds } from './kuji';
import { mysteriousOdds } from './mysterious';
import { pureOdds } from './pure';
import { templeOdds } from './temple';

/**
 * 概率核对（问题记录 511）：pnpm -F @dt/server odds，报告在 sim-out/odds/。
 * ODDS_SCALE 调次数（0.1 先快速跑一遍）；ODDS_ONLY=bar,temple 只跑其中几块
 */
let t: TestGame;
beforeAll(async () => {
  t = await oddsGame();
});
afterAll(async () => {
  console.log(`报告：${writeReport()}`);
  await t.close();
});

const only = process.env.ODDS_ONLY?.split(',');
const suite = (key: string, name: string, run: (t: TestGame) => Promise<void>) =>
  it.skipIf(only !== undefined && !only.includes(key))(name, () => run(t));

suite('bar', '酒吧', barOdds);
suite('temple', '神殿', templeOdds);
suite('equip', '厨具', equipOdds);
suite('mysterious', '神秘菜谱', mysteriousOdds);
suite('kuji', '一番赏', kujiOdds);
suite('pure', '竞猜', pureOdds);

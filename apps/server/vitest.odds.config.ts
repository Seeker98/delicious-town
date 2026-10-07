import { defineProject } from 'vitest/config';
import { testEnv } from './test/testEnv';

/** 概率核对（问题记录 511）：不进 CI，要时手动跑 pnpm -F @dt/server odds */
export default defineProject({
  test: {
    name: 'odds',
    include: ['src/sim/odds/*.run.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    env: testEnv,
    testTimeout: 4 * 3600_000,
    hookTimeout: 120_000,
  },
});

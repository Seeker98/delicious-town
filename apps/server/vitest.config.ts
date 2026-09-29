import { defineProject } from 'vitest/config';
import { testEnv } from './test/testEnv';

export default defineProject({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    env: testEnv,
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});

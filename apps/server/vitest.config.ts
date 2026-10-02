import { defineProject } from 'vitest/config';
import { testEnv } from './test/testEnv';

export default defineProject({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    env: testEnv,
    // 不隔离：同一个子进程里的测试文件共用已加载的模块，不用每个文件都重新导入整个服务端
    // （导入占了九成时间）。服务端测试不用 vi.mock，各自建区服和店，互不干扰。
    // 这个选项只在单独用本配置运行时生效（pnpm test 会这样跑），从仓库根目录按 projects 运行时 vitest 会忽略它
    isolate: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});

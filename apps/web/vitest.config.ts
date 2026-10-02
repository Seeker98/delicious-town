import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [vue()],
  // vmThreads：每个测试文件用独立的 vm 上下文隔离，不用每个文件重新起一套 jsdom 进程环境，快一倍多
  // 测试超时 15 秒：切换语言要动态加载整个语言包，全量和服务端测试并行跑时首次加载可能超过默认 5 秒（问题记录 272）
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    pool: 'vmThreads',
    testTimeout: 15_000,
  },
});

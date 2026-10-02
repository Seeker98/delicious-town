import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [vue()],
  // vmThreads：每个测试文件用独立的 vm 上下文隔离，不用每个文件重新起一套 jsdom 进程环境，快一倍多
  test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.ts'], pool: 'vmThreads' },
});

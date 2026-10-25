import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';
import { inlineLimit } from './src/build/artAssets';

// 测试机固定在伦敦时区：北京时间的格式化断言在测试机就是 Asia/Shanghai 时会照样通过、测不出问题（backlog）
process.env.TZ = 'Europe/London';

export default defineProject({
  // 和 vite.config.ts 一致：不带选项式 API
  plugins: [vue({ features: { optionsAPI: false } })],
  // 前端版本号（防脚本 2026-10-25）：测试里固定为 test
  define: { __DT_BUILD__: JSON.stringify('test') },
  // 和 vite.config.ts 一致：图形雪碧图不内联
  build: { assetsInlineLimit: inlineLimit },
  // vmThreads：每个测试文件用独立的 vm 上下文隔离，不用每个文件重新起一套 jsdom 进程环境，快一倍多
  // 测试超时 15 秒：切换语言要动态加载整个语言包，全量和服务端测试并行跑时首次加载可能超过默认 5 秒（问题记录 272）
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    pool: 'vmThreads',
    testTimeout: 15_000,
    // 挂载组件时自动装上当前的 pinia（src/testSetup.ts）
    setupFiles: ['./src/testSetup.ts'],
  },
});

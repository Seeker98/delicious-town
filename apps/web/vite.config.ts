import vue from '@vitejs/plugin-vue';
import obfuscator from 'rollup-plugin-obfuscator';
import { defineConfig, loadEnv } from 'vite';
import { inlineLimit } from './src/build/artAssets';
import { localePreloadPlugin } from './src/build/localePreload';
import { preconnectTags } from './src/build/preconnect';

export default defineConfig(({ mode }) => {
  // loadEnv 也读进程环境变量：Cloudflare Pages 构建时 VITE_API_BASE 是平台设的，不在 .env 文件里
  const apiBase = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE;
  // 前端版本号（防脚本 2026-10-25）：写请求都带上；Cloudflare Pages 构建时有提交号
  const build = (process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'dev').slice(0, 12);
  return {
    // 组件全用 <script setup>：不带选项式 API 那部分运行时（vitest.config.ts 同样设）
    plugins: [
      vue({ features: { optionsAPI: false } }),
      { name: 'dt-preconnect-api', transformIndexHtml: () => preconnectTags(apiBase) },
      // 选中的语言包和入口 JS 一起下载（性能 2026-10-31）：各语言包的文件写进页面头部，public/theme-init.js 按语言挑
      localePreloadPlugin(),
      // 防脚本 PR②（设计第 7 节）：只在打包时把写请求签名的两个模块混淆，每次打包结果不同（seed 0 = 随机）；
      // 其余代码不动，报错定位照常
      {
        ...obfuscator({
          include: ['**/apps/web/src/api/antibot.ts', '**/packages/shared/src/antibot.ts'],
          options: { seed: 0, stringArray: true, controlFlowFlattening: true, sourceMap: false },
        }),
        apply: 'build',
      },
    ],
    define: { __DT_BUILD__: JSON.stringify(build) },
    // 开发时把 /api 代理到本地服务端，前后端同源，不用处理 CORS
    server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
    // 图形雪碧图单独成文件（<use> 不能引用 data: 地址）
    build: { assetsInlineLimit: inlineLimit },
  };
});

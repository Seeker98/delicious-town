import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import { preconnectTags } from './src/build/preconnect';

export default defineConfig(({ mode }) => {
  // loadEnv 也读进程环境变量：Cloudflare Pages 构建时 VITE_API_BASE 是平台设的，不在 .env 文件里
  const apiBase = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE;
  return {
    plugins: [vue(), { name: 'dt-preconnect-api', transformIndexHtml: () => preconnectTags(apiBase) }],
    // 开发时把 /api 代理到本地服务端，前后端同源，不用处理 CORS
    server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  };
});

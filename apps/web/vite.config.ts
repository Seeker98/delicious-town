import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  // 开发时把 /api 代理到本地服务端，前后端同源，不用处理 CORS
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});

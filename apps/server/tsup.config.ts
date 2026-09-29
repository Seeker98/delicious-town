import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    worker: 'src/worker.ts',
    'cli/shard': 'src/cli/shard.ts',
    'cli/migrate': 'src/cli/migrate.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // 工作区包以 TS 源码形式存在，必须打进产物
  noExternal: [/^@dt\//],
});

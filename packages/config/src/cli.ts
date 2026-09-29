import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const dir = process.argv[2] ?? defaultDataDir();
const out = process.argv[3] ?? fileURLToPath(new URL('../generated/bundle.json', import.meta.url));
const { bundle, errors } = buildBundle(readSourceDir(dir));
if (!bundle) {
  console.error(`配置校验失败（${errors.length} 条）：`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(bundle));
console.log(`config bundle ${bundle.version} -> ${out}`);

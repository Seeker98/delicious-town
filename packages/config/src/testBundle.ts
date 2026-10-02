import { buildBundle, type BuildResult } from './build';
import { defaultDataDir, readSourceDir } from './source';

let cached: BuildResult | null = null;

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/**
 * 测试用：真实数据的构建结果，同一个测试文件里只构建一次（每次构建要 0.1~0.2 秒）。
 * 结果冻结，测试改了它会直接报错；要改数据再构建的测试照旧调用 buildBundle
 */
export function realBuild(): BuildResult {
  cached ??= deepFreeze(buildBundle(readSourceDir(defaultDataDir())));
  return cached;
}

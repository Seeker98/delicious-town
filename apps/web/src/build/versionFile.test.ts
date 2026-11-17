import { describe, expect, it, vi } from 'vitest';
import { VERSION_FILE, versionFilePlugin } from './versionFile';

describe('打包时生成 version.json（旧版本提醒）', () => {
  it('只在打包时生效，写进这次的版本号', () => {
    const p = versionFilePlugin('abc123def456');
    expect(p.apply).toBe('build');
    const emitFile = vi.fn();
    (p.generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: VERSION_FILE,
      source: JSON.stringify({ build: 'abc123def456' }),
    });
  });
});

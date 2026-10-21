import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('随机 UUID', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('有 crypto.randomUUID 时直接用', () => {
    expect(uuid()).toMatch(V4);
  });

  it('局域网 IP 打开（不是安全环境）没有 randomUUID：用 getRandomValues 拼出合法的 v4，每次不同', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const a = uuid();
    const b = uuid();
    expect(a).toMatch(V4);
    expect(b).toMatch(V4);
    expect(a).not.toBe(b);
  });
});

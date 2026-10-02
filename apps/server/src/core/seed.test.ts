import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashSeed } from '@dt/shared';
import { gameSeed, setSeedSecret } from './seed';

afterEach(() => setSeedSecret(''));

describe('随机种子混入服务器密钥（RNG_SECRET）', () => {
  it('没配密钥时和公开的 hashSeed 一样（开发、测试的结果不变）', () => {
    expect(gameSeed(3, 'weather', '2026-10-02@13')).toBe(hashSeed(3, 'weather', '2026-10-02@13'));
  });

  it('配了密钥：结果和公开算法不同，同样的输入结果稳定，不同密钥结果不同', () => {
    setSeedSecret('s3cret-for-test-only');
    const a = gameSeed(3, 'weather', '2026-10-02@13');
    expect(a).not.toBe(hashSeed(3, 'weather', '2026-10-02@13'));
    expect(gameSeed(3, 'weather', '2026-10-02@13')).toBe(a);
    setSeedSecret('another-secret-value');
    expect(gameSeed(3, 'weather', '2026-10-02@13')).not.toBe(a);
  });

  it('配了密钥时用 HMAC-SHA256（终审 C1：拼进 32 位 FNV 的密钥能被离线穷举 2^32 种内部状态还原）', () => {
    setSeedSecret('s3cret-for-test-only');
    const mac = createHmac('sha256', 's3cret-for-test-only').update('3|weather|2026-10-02@13').digest();
    expect(gameSeed(3, 'weather', '2026-10-02@13')).toBe(mac.readUInt32LE(0));
  });

  it('业务模块都用 gameSeed，不直接用公开的 hashSeed（源码公开时算得出未来的天气、菜场、蟹老板）', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          name.endsWith('.ts') &&
          !name.endsWith('.test.ts') &&
          /\bhashSeed\(/.test(readFileSync(p, 'utf8'))
        )
          offenders.push(p);
      }
    };
    walk(join(__dirname, '..', 'modules'));
    expect(offenders).toEqual([]);
  });
});

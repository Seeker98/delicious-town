import { describe, expect, it } from 'vitest';
import { canonical, hmacSign, newSignKey, sha256Hex } from './antibot';
import { ErrorCode } from './errors';

const fields = {
  ts: 1700000000000,
  nonce: 'k1',
  method: 'post',
  path: '/api/v1/x?a=1',
  bodySha256: 'abc',
  build: 'b1',
  env: 0,
  idle: -1,
};

describe('请求签名协议', () => {
  it('拼串按固定顺序，方法转大写', () => {
    expect(canonical(fields)).toBe('1700000000000\nk1\nPOST\n/api/v1/x?a=1\nabc\nb1\n0\n-1');
  });

  it('SHA-256 十六进制', async () => {
    expect(await sha256Hex('{}')).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  });

  it('HMAC 同输入同输出、改一个字符就变、base64url 无填充', async () => {
    const key = newSignKey();
    const a = await hmacSign(key, 'hello');
    expect(await hmacSign(key, 'hello')).toBe(a);
    expect(await hmacSign(key, 'hellp')).not.toBe(a);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('签名密钥每次不同、长度 43', () => {
    const a = newSignKey();
    expect(a).toHaveLength(43);
    expect(newSignKey()).not.toBe(a);
  });

  it('错误码 CLIENT_UNVERIFIED', () => {
    expect(ErrorCode.CLIENT_UNVERIFIED).toBe('CLIENT_UNVERIFIED');
  });
});

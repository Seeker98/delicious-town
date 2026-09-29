import { describe, expect, it, vi } from 'vitest';
import { disabledCaptcha, fixedCaptcha, turnstileCaptcha } from './captcha';

describe('turnstileCaptcha', () => {
  it('把 secret、token、ip 发给 Cloudflare，按 success 返回', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true })),
    );
    const ok = await turnstileCaptcha('sec', fetchImpl).verify('tok', '1.2.3.4');
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init!.body as URLSearchParams;
    expect(body.get('secret')).toBe('sec');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('校验失败或网络错误都返回 false', async () => {
    const no = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    expect(await turnstileCaptcha('s', no).verify('t', 'ip')).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await turnstileCaptcha('s', broken).verify('t', 'ip')).toBe(false);
  });

  it('开发用的实现', async () => {
    expect(await disabledCaptcha().verify('', '')).toBe(true);
    expect(await fixedCaptcha(false).verify('x', 'y')).toBe(false);
  });
});

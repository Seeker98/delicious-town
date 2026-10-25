import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AB_HEADERS, canonical, hmacSign, sha256Hex } from '@dt/shared';
import { envBits, idleMs, installHumanTracker, prefetchSignKey, resetSignKey, signHeaders } from './antibot';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('网页端签名（防脚本 2026-10-25）', () => {
  beforeEach(() => resetSignKey());

  it('环境位：被自动化工具控制、无头浏览器', () => {
    expect(envBits({ webdriver: true, userAgent: 'Mozilla/5.0' } as Navigator)).toBe(1);
    expect(envBits({ webdriver: false, userAgent: 'Mozilla/5.0 HeadlessChrome/120' } as Navigator)).toBe(2);
    expect(envBits({ webdriver: false, userAgent: 'Mozilla/5.0' } as Navigator)).toBe(0);
  });

  it('脚本派发的点击不算真人操作', () => {
    const t = new EventTarget();
    installHumanTracker(t);
    t.dispatchEvent(new Event('pointerdown'));
    expect(idleMs()).toBe(-1);
  });

  it('时间戳按服务器时间、签名服务端能复算；密钥只取一次', async () => {
    const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const ahead = 3 * 3_600_000;
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ok: true, data: { key, serverNow: new Date(Date.now() + ahead).toISOString() }, events: [] }),
    );
    const i = { method: 'POST' as const, path: '/api/v1/x', bodyText: '{"a":1}', nonce: 'n-12345678' };
    const h = await signHeaders(f, 'http://api', i);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe('http://api/api/v1/account/sign-key');
    const ts = Number(h[AB_HEADERS.ts]);
    expect(Math.abs(ts - (Date.now() + ahead))).toBeLessThan(5000);
    const expected = await hmacSign(
      key,
      canonical({
        ts,
        nonce: i.nonce,
        method: 'POST',
        path: i.path,
        bodySha256: await sha256Hex(i.bodyText),
        build: 'test',
        env: Number(h[AB_HEADERS.env]),
        idle: Number(h[AB_HEADERS.idle]),
      }),
    );
    expect(h[AB_HEADERS.sig]).toBe(expected);
    await signHeaders(f, 'http://api', i);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('取不到密钥（没登录）就不签', async () => {
    const f = vi.fn(async () => json({ ok: false, code: 'UNAUTHORIZED' }));
    expect(
      await signHeaders(f, '', { method: 'POST', path: '/x', bodyText: '{}', nonce: 'n-12345678' }),
    ).toEqual({});
  });

  it('取密钥回“没登录”后记住，下一次写请求不再白跑；重置后再取', async () => {
    const f = vi.fn(async () => json({ ok: false, code: 'UNAUTHORIZED' }));
    const i = { method: 'POST' as const, path: '/x', bodyText: '{}', nonce: 'n-12345678' };
    await signHeaders(f, '', i);
    await signHeaders(f, '', i);
    expect(f).toHaveBeenCalledTimes(1);
    resetSignKey();
    await signHeaders(f, '', i);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('浏览器没有 WebCrypto（非 https 页面）：不签，也不去取密钥', async () => {
    const f = vi.fn(async () => json({ ok: false, code: 'UNAUTHORIZED' }));
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a });
    try {
      const i = { method: 'POST' as const, path: '/x', bodyText: '{}', nonce: 'n-12345678' };
      expect(await signHeaders(f, '', i)).toEqual({});
      expect(await signHeaders(f, '', i)).toEqual({});
      expect(f).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('预取密钥后，第一个写请求不用再等取密钥', async () => {
    const f = vi.fn(async () =>
      json({
        ok: true,
        data: { key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', serverNow: new Date().toISOString() },
      }),
    );
    prefetchSignKey(f, '');
    prefetchSignKey(f, '');
    const h = await signHeaders(f, '', { method: 'POST', path: '/x', bodyText: '{}', nonce: 'n-12345678' });
    expect(h[AB_HEADERS.sig]).toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('浏览器的 WebCrypto 出错时不签名，不往外抛', async () => {
    const f = vi.fn(async () =>
      json({
        ok: true,
        data: { key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', serverNow: new Date().toISOString() },
      }),
    );
    const spy = vi.spyOn(globalThis.crypto.subtle, 'sign').mockRejectedValue(new Error('broken webview'));
    try {
      expect(
        await signHeaders(f, '', { method: 'POST', path: '/x', bodyText: '{}', nonce: 'n-12345678' }),
      ).toEqual({});
    } finally {
      spy.mockRestore();
    }
  });
});

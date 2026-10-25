import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AB_HEADERS } from '@dt/shared';
import { resetSignKey } from './antibot';
import { ApiError, createApiClient } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('成功时返回 data，带上 Cookie', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ok: true, data: { a: 1 }, events: [] }),
    );
    const api = createApiClient(f, 'http://api');
    expect(await api.get('/x')).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('http://api/x');
    expect(init!.method).toBe('GET');
    expect(init!.credentials).toBe('include');
  });

  it('公开接口（开放接口，问题记录 142）：不带 Cookie、不带自定义头，浏览器不发预检、可以用 * 跨域', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ok: true, data: { a: 1 }, events: [] }),
    );
    expect(await createApiClient(f, 'http://api').getPublic('/open')).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('http://api/open');
    expect(init!.credentials).toBe('omit');
    expect(init!.headers).toEqual({});
  });

  it('POST 发送 JSON、幂等键和设备标识', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, data: null, events: [] }));
    await createApiClient(f, '').post('/y', { n: 1 });
    // 第一次是取签名密钥（防脚本 2026-10-25）
    const init = f.mock.calls.find((c) => c[1]?.method === 'POST')![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-device-id']).toBeTruthy();
    expect(init.body).toBe('{"n":1}');
  });

  it('业务失败抛 ApiError(code, params)', async () => {
    const f = vi.fn(async () =>
      json({ ok: false, code: 'RESTAURANT_NAME_INVALID', params: { reason: 'reserved' } }, 400),
    );
    await expect(createApiClient(f, '').post('/z')).rejects.toMatchObject({
      code: 'RESTAURANT_NAME_INVALID',
      params: { reason: 'reserved' },
    });
  });

  it('网络错误或响应不是 JSON 都抛 NETWORK', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    await expect(createApiClient(down, '').get('/a')).rejects.toBeInstanceOf(ApiError);
    await expect(createApiClient(down, '').get('/a')).rejects.toMatchObject({ code: 'NETWORK' });
    const html = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(createApiClient(html, '').get('/a')).rejects.toMatchObject({
      code: 'NETWORK',
      params: { status: 502 },
    });
  });
});

describe('写请求签名（防脚本 2026-10-25）', () => {
  beforeEach(() => resetSignKey());
  const KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  /** 假后端：取密钥接口回密钥，其余按 handler */
  function backend(handler: (url: string, init: RequestInit) => Response) {
    let keys = 0;
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/account/sign-key')) {
        keys++;
        return json({ ok: true, data: { key: KEY, serverNow: new Date().toISOString() }, events: [] });
      }
      return handler(url, init!);
    });
    return { f, keys: () => keys };
  }
  const posts = (f: ReturnType<typeof backend>['f']) =>
    f.mock.calls.filter((c) => c[1]?.method === 'POST').map((c) => c[1]!.headers as Record<string, string>);

  it('写请求带齐签名相关的 6 个头，读请求只带版本号', async () => {
    const { f } = backend(() => json({ ok: true, data: 1, events: [] }));
    const api = createApiClient(f, '');
    await api.post('/y', { n: 1 });
    await api.get('/g');
    const h = posts(f)[0]!;
    for (const k of [
      AB_HEADERS.ts,
      AB_HEADERS.sig,
      AB_HEADERS.env,
      AB_HEADERS.idle,
      AB_HEADERS.build,
      'idempotency-key',
    ])
      expect(h[k]).toBeTruthy();
    const g = f.mock.calls.find((c) => c[0] === '/g')![1]!.headers as Record<string, string>;
    expect(g[AB_HEADERS.build]).toBe('test');
    expect(g[AB_HEADERS.sig]).toBeUndefined();
  });

  it('响应带 x-dt-resign 后，下一次写请求重新取密钥', async () => {
    const b = backend(
      () =>
        new Response(JSON.stringify({ ok: true, data: 1, events: [] }), {
          headers: { 'content-type': 'application/json', [AB_HEADERS.resign]: '1' },
        }),
    );
    const api = createApiClient(b.f, '');
    await api.post('/y');
    await api.post('/y');
    expect(b.keys()).toBe(2);
  });

  it('被拦（签名不对）时重取密钥、换新随机数自动重发一次', async () => {
    let n = 0;
    const b = backend(() =>
      ++n === 1
        ? json({ ok: false, code: 'CLIENT_UNVERIFIED', params: { reason: 'bad' } }, 403)
        : json({ ok: true, data: 'second', events: [] }),
    );
    expect(await createApiClient(b.f, '').post('/y')).toBe('second');
    const [first, second] = posts(b.f);
    expect(first!['idempotency-key']).not.toBe(second!['idempotency-key']);
    expect(b.keys()).toBe(2);
  });

  it('重发一次还被拦就报错，不再重试', async () => {
    const b = backend(() => json({ ok: false, code: 'CLIENT_UNVERIFIED', params: { reason: 'bad' } }, 403));
    await expect(createApiClient(b.f, '').post('/y')).rejects.toMatchObject({ code: 'CLIENT_UNVERIFIED' });
    expect(posts(b.f)).toHaveLength(2);
  });

  it('匿名请求不带任何新请求头', async () => {
    const { f } = backend(() => json({ ok: true, data: 1, events: [] }));
    await createApiClient(f, '').getPublic('/open');
    expect(f.mock.calls[0]![1]!.headers).toEqual({});
  });

  it('登录、注册、注销成功后换会话：下一次写请求重新取密钥', async () => {
    const b = backend(() => json({ ok: true, data: 1, events: [] }));
    const api = createApiClient(b.f, '');
    await api.post('/y');
    expect(b.keys()).toBe(1);
    await api.post('/api/v1/account/login', { username: 'a', password: 'b' });
    await api.post('/y');
    expect(b.keys()).toBe(2);
  });
});

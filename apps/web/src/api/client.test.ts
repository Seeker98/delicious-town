import { describe, expect, it, vi } from 'vitest';
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

  it('POST 发送 JSON、幂等键和设备标识', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, data: null, events: [] }));
    await createApiClient(f, '').post('/y', { n: 1 });
    const init = f.mock.calls[0]![1]!;
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

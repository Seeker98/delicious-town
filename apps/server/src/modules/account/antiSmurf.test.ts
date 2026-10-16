import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uniqueName } from '../../../test/fixtures';
import { call, createTestApp, testEnvWith, type TestContext } from '../../../test/helpers';
import { canonicalEmail } from './email';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ env: testEnvWith({ REGISTER_PER_IP: 2, REGISTER_PER_DEVICE: 2 }) });
});
afterAll(() => ctx.close());

const register = (o: { ip: string; device?: string; email?: string }) =>
  call(ctx.app, 'POST', '/api/v1/account/register', {
    body: {
      username: uniqueName('u'),
      password: 'secret123',
      email: o.email ?? `${uniqueName('m')}@test.local`,
      captchaToken: 't',
    },
    ip: o.ip,
    headers: o.device ? { 'x-device-id': o.device } : {},
  });

describe('邮箱查重写法（2026-10-16 防小号）', () => {
  it('小写、去掉 + 后缀；Gmail 再去掉点、googlemail 当 gmail', () => {
    expect(canonicalEmail(' A.B+game@Gmail.com ')).toBe('ab@gmail.com');
    expect(canonicalEmail('a.b@googlemail.com')).toBe('ab@gmail.com');
    expect(canonicalEmail('A.B+x@QQ.com')).toBe('a.b@qq.com');
  });

  it('同一个邮箱换写法注册报 EMAIL_TAKEN', async () => {
    const local = uniqueName('m').replaceAll('_', '');
    expect((await register({ ip: '198.51.100.11', email: `${local}@gmail.com` })).status).toBe(200);
    const again = await register({
      ip: '198.51.100.12',
      email: `${local.slice(0, 2)}.${local.slice(2)}+x@GMAIL.com`,
    });
    expect(again.json.code).toBe('EMAIL_TAKEN');
  });
});

describe('注册限量（2026-10-16 小号刷一番赏）', () => {
  it('同一 IP 24 小时内最多 2 个号，第 3 个报 LIMIT_REACHED register_ip；别的 IP 不受影响', async () => {
    expect((await register({ ip: '198.51.100.21' })).status).toBe(200);
    expect((await register({ ip: '198.51.100.21' })).status).toBe(200);
    const third = await register({ ip: '198.51.100.21' });
    expect(third.json).toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'register_ip', max: 2 } });
    expect((await register({ ip: '198.51.100.22' })).status).toBe(200);
  });

  it('IPv6 按 /64 算：同一段换地址也算同一个 IP', async () => {
    expect((await register({ ip: '2001:db8:16:16::1' })).status).toBe(200);
    expect((await register({ ip: '2001:db8:16:16::2' })).status).toBe(200);
    const third = await register({ ip: '2001:db8:16:16:abcd::3' });
    expect(third.json.params).toMatchObject({ what: 'register_ip' });
    expect((await register({ ip: '2001:db8:16:17::1' })).status).toBe(200);
  });

  it('同一设备最多 2 个号（换 IP 也一样）', async () => {
    const dev = `dev-${uniqueName('d')}`.slice(0, 40);
    expect((await register({ ip: '198.51.100.31', device: dev })).status).toBe(200);
    expect((await register({ ip: '198.51.100.32', device: dev })).status).toBe(200);
    const third = await register({ ip: '198.51.100.33', device: dev });
    expect(third.json).toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'register_device', max: 2 } });
  });
});

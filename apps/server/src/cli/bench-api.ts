/**
 * 接口耗时压测（质量期 ③，方法见 docs/performance.md）：用一个玩家账号依次请求常用的 GET 接口，
 * 每个先热 2 次、再计 N 次，读服务端的 Server-Timing（开发服 .env.development 已打开 DB_QUERY_STATS），
 * 报服务端总耗时的中位数和 p95、查询耗时和条数、响应的字符数（解压后）。
 *
 *   pnpm -F @dt/server bench:api <用户名> [区服 id]
 *   环境变量：BASE（默认 http://localhost:3000/api/v1）、N（默认 20）、PASSWORD（默认 secret123，e2e 测试号的密码）、
 *   PATHS（逗号分隔，覆盖默认的接口列表）
 */
const BASE = process.env.BASE ?? 'http://localhost:3000/api/v1';
const N = Number(process.env.N ?? 20);
const [user, shardArg] = process.argv.slice(2);
const PATHS = (
  process.env.PATHS ??
  [
    '/account/me',
    '/restaurant/overview',
    '/activities/summary',
    '/activities',
    '/task/list',
    '/task/activation',
    '/world/catalog',
    '/mail/unread',
    '/announcements',
    '/friend/requests',
    '/town',
    '/town/news',
    '/kuji',
    '/fund',
    '/market/view',
    '/exchange/foods',
    '/exchange/me',
    '/bar',
    '/restaurant/income',
    '/cupboard/list',
    '/restaurant/floor',
    '/restaurant/buffs',
    '/growth/star',
    '/store/list',
    '/equip/overview',
    '/equip/list',
    '/growth/devices',
    '/takeaway',
    '/predict/events',
    '/tower',
    '/temple',
    '/shop/items',
  ].join(',')
).split(',');

let cookie = '';
interface Sample {
  status: number;
  bytes: number;
  app: number;
  db: number;
  queries: number;
}

async function req(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Sample> {
  const r = await fetch(BASE + path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.getSetCookie();
  if (set.length > 0) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  const m = /db;dur=([\d.]+);desc="(\d+) queries", app;dur=([\d.]+)/.exec(
    r.headers.get('server-timing') ?? '',
  );
  return {
    status: r.status,
    bytes: text.length,
    db: m ? Number(m[1]) : NaN,
    queries: m ? Number(m[2]) : NaN,
    app: m ? Number(m[3]) : NaN,
  };
}

const quantile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN;
};

async function main(): Promise<void> {
  if (!user) throw new Error('用法：bench:api <用户名> [区服 id]');
  const login = await req('POST', '/account/login', {
    username: user,
    password: process.env.PASSWORD ?? 'secret123',
  });
  if (login.status !== 200) throw new Error(`登录失败：${login.status}`);
  const select = await req('POST', '/shard/select', { shardId: Number(shardArg ?? 1) });
  if (select.status !== 200) throw new Error(`选区服失败：${select.status}`);
  if (Number.isNaN(select.app)) console.warn('没有 Server-Timing：服务端要打开 DB_QUERY_STATS');
  const rows: Array<{ path: string; first: Sample; samples: Sample[] }> = [];
  for (const path of PATHS) {
    const first = await req('GET', path);
    if (first.status === 404) continue;
    await req('GET', path);
    const samples: Sample[] = [];
    for (let i = 0; i < N; i++) samples.push(await req('GET', path));
    rows.push({ path, first, samples });
  }
  const med = (s: Sample[], k: 'app' | 'db' | 'queries') =>
    quantile(
      s.map((x) => x[k]),
      0.5,
    );
  rows.sort((a, b) => med(b.samples, 'app') - med(a.samples, 'app'));
  // chars：解压后的字符数，不是传输大小
  console.log('app50  app95   db50  queries   chars  status path');
  for (const r of rows)
    console.log(
      [
        med(r.samples, 'app').toFixed(1).padStart(5),
        quantile(
          r.samples.map((x) => x.app),
          0.95,
        )
          .toFixed(1)
          .padStart(6),
        med(r.samples, 'db').toFixed(1).padStart(6),
        String(med(r.samples, 'queries')).padStart(8),
        String(r.first.bytes).padStart(7),
        ` ${r.first.status}  `,
        r.path,
      ].join(' '),
    );
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

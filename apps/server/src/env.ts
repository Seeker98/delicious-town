import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).default(20),
  REDIS_URL: z.string().url(),
  CONFIG_BUNDLE_PATH: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  /** 登录 Cookie 的域名（网页和 API 同域名的过渡，见 docs/deploy.md 三之二）；前面的点去掉 */
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/^\./, '') : undefined)),
  COOKIE_SECURE: bool.default('false'),
  TRUST_CF_HEADER: bool.default('false'),
  TURNSTILE_SECRET: z.string().default(''),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('美味小镇 <noreply@localhost>'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  MIGRATE_ON_START: bool.default('false'),
  ENABLE_TEST_API: bool.default('false'),
  /** 限流倍数：开发环境调大（e2e 的多个玩家共用 localhost 一个 IP），生产保持 1 */
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
  /**
   * 随机种子密钥：混进天气、菜场、蟹老板等确定性随机种子，源码公开也算不出未来的结果。
   * 生产环境可以不配：启动时从数据库读，没有就生成一个存进去（问题记录 262，见 core/seedSecret.ts）
   */
  RNG_SECRET: z.string().default(''),
  /** 每个请求的查询条数和耗时写进 Server-Timing 响应头（质量期 ③，开发、排查时打开） */
  DB_QUERY_STATS: bool.default('false'),
  /** 慢查询警告阈值（毫秒）；0 = 不记 */
  DB_SLOW_MS: z.coerce.number().min(0).default(0),
  /** 小镇日报的 AI 密钥（DeepSeek，OpenAI 兼容接口）；不配就只生成素材、不调用 AI */
  DAILY_AI_KEY: z.string().default(''),
  DAILY_AI_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  /** V4.1 Flash 的模型名（官方文档：旧名 deepseek-v4-flash 也指向它） */
  DAILY_AI_MODEL: z.string().min(1).default('deepseek-flash'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = envSchema.parse(source);
  // 填错（比如填成 api 子域名）浏览器会拒收这个 Cookie，同时旧 Cookie 又被删掉：所有人掉线还登录不上
  if (env.COOKIE_DOMAIN) {
    const host = new URL(env.WEB_ORIGIN).hostname;
    if (host !== env.COOKIE_DOMAIN && !host.endsWith(`.${env.COOKIE_DOMAIN}`))
      throw new Error(`COOKIE_DOMAIN ${env.COOKIE_DOMAIN} must be ${host} or a parent domain of it`);
  }
  if (env.NODE_ENV === 'production') {
    if (!env.TURNSTILE_SECRET) throw new Error('TURNSTILE_SECRET is required in production');
    if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
    if (env.ENABLE_TEST_API) throw new Error('ENABLE_TEST_API must be false in production');
    if (env.RNG_SECRET && env.RNG_SECRET.length < 16)
      throw new Error(
        'RNG_SECRET must be at least 16 chars (or leave it empty to use the one stored in the database)',
      );
  }
  return env;
}

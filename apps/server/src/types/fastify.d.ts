import 'fastify';
import type { LoadedSession } from '../security/session';
import type { RateRuleName } from '../security/rateLimiter';

declare module 'fastify' {
  interface FastifyRequest {
    clientIp: string;
    session: LoadedSession | null;
    idempotency: { key: string } | null;
  }
  interface FastifyContextConfig {
    rateLimit?: RateRuleName;
  }
}

import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import type { DB } from '../db/schema';
import { fail, ok } from './reply';

export function registerHealth(app: FastifyInstance, deps: { db: Kysely<DB>; redis: Redis }): void {
  app.get('/healthz', async () => ok({ status: 'ok' }));
  app.get('/readyz', async (req, reply) => {
    try {
      await sql`select 1`.execute(deps.db);
      await deps.redis.ping();
      return ok({ status: 'ready' });
    } catch (err) {
      req.log.error({ err }, 'readiness check failed');
      return reply.code(503).send(fail(ErrorCode.INTERNAL));
    }
  });
}

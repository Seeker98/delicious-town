import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode } from '@dt/shared';
import { AppError } from './errors';
import { fail } from './reply';

export function registerErrorHandling(app: FastifyInstance): void {
  // 写操作只接受 JSON：挡住跨站表单提交
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'POST') return;
    const length = Number(req.headers['content-length'] ?? '0');
    const hasBody = length > 0 || req.headers['transfer-encoding'] !== undefined;
    const type = req.headers['content-type'] ?? '';
    if (hasBody && !type.startsWith('application/json')) {
      reply.code(415).send(fail(ErrorCode.VALIDATION_FAILED, { reason: 'json_required' }));
      return reply;
    }
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send(fail(err.code, err.params));
    if (err instanceof ZodError) {
      return reply.code(400).send(
        fail(ErrorCode.VALIDATION_FAILED, {
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }),
      );
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status < 500) {
      return reply
        .code(status)
        .send(fail(ErrorCode.VALIDATION_FAILED, { reason: (err as FastifyError).code ?? 'bad_request' }));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(fail(ErrorCode.INTERNAL));
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(fail(ErrorCode.NOT_FOUND)));
}

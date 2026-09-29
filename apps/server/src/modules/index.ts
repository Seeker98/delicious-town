import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { accountRoutes } from './account/routes';
import { createAccountService } from './account/service';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  app.register(accountRoutes(createAccountService(deps), deps), { prefix: '/api/v1/account' });
}

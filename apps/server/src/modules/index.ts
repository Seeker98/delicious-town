import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { accountRoutes } from './account/routes';
import { createAccountService } from './account/service';
import { shardRoutes } from './shard/routes';
import { createShardService } from './shard/service';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  const shards = createShardService(deps);
  app.register(accountRoutes(createAccountService(deps), deps), { prefix: '/api/v1/account' });
  app.register(shardRoutes(shards), { prefix: '/api/v1/shard' });
}

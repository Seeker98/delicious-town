import type { FastifyInstance } from 'fastify';
import type { Game } from '../game';
import { accountRoutes } from './account/routes';
import { cookbookRoutes } from './cookbook/routes';
import { cupboardRoutes } from './cupboard/routes';
import { growthRoutes } from './growth/routes';
import { restaurantRoutes } from './restaurant/routes';
import { shardRoutes } from './shard/routes';
import { worldRoutes } from './world/routes';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, game: Game): void {
  app.register(accountRoutes(game.account, game.app), { prefix: '/api/v1/account' });
  app.register(shardRoutes(game.shards), { prefix: '/api/v1/shard' });
  app.register(restaurantRoutes(game.restaurant), { prefix: '/api/v1/restaurant' });
  app.register(worldRoutes(game.world), { prefix: '/api/v1/world' });
  app.register(growthRoutes(game.growth), { prefix: '/api/v1/growth' });
  app.register(cookbookRoutes(game.cookbook), { prefix: '/api/v1/cookbook' });
  app.register(cupboardRoutes(game.cupboard), { prefix: '/api/v1/cupboard' });
}

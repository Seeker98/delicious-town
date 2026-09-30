import type { FastifyInstance } from 'fastify';
import type { Game } from '../game';
import { accountRoutes } from './account/routes';
import { adminRoutes } from './admin/routes';
import { cookbookRoutes } from './cookbook/routes';
import { cupboardRoutes } from './cupboard/routes';
import { equipRoutes } from './equip/routes';
import { socialRoutes } from './friend/routes';
import { growthRoutes } from './growth/routes';
import { marketRoutes } from './market/routes';
import { restaurantRoutes } from './restaurant/routes';
import { shardRoutes } from './shard/routes';
import { shopRoutes } from './shop/routes';
import { storeRoutes } from './store/routes';
import { taskRoutes } from './task/routes';
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
  app.register(storeRoutes(game.store), { prefix: '/api/v1/store' });
  app.register(shopRoutes(game.shop), { prefix: '/api/v1/shop' });
  app.register(marketRoutes(game.market), { prefix: '/api/v1/market' });
  app.register(taskRoutes(game.task), { prefix: '/api/v1/task' });
  app.register(adminRoutes(game), { prefix: '/api/v1/admin' });
  app.register(socialRoutes(game.social), { prefix: '/api/v1' });
  app.register(equipRoutes(game.equip), { prefix: '/api/v1' });
}

import { cryptoRng } from '@dt/shared';
import type { AppDeps } from './app';
import type { GameDeps } from './core/deps';
import type { PeriodicJob } from './core/jobs';
import { createAccountService, type AccountService } from './modules/account/service';
import { createRestaurantService, type RestaurantService } from './modules/restaurant/service';
import { createShardService, type ShardService } from './modules/shard/service';

/** 所有游戏服务的装配：HTTP 路由、worker、模拟器共用 */
export interface Game {
  app: AppDeps;
  deps: GameDeps;
  shards: ShardService;
  account: AccountService;
  restaurant: RestaurantService;
  jobs: PeriodicJob[];
}

export function createGame(app: AppDeps): Game {
  const shards = createShardService(app);
  const deps: GameDeps = {
    db: app.db,
    redis: app.redis,
    config: app.config,
    bus: app.bus,
    now: app.now,
    rng: app.rng ?? cryptoRng,
    shards,
  };
  const jobs: PeriodicJob[] = [];
  return {
    app,
    deps,
    shards,
    account: createAccountService(app),
    restaurant: createRestaurantService(app, shards),
    jobs,
  };
}

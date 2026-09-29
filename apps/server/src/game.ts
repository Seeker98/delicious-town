import { cryptoRng } from '@dt/shared';
import type { AppDeps } from './app';
import type { GameDeps } from './core/deps';
import type { PeriodicJob } from './core/jobs';
import { createAccountService, type AccountService } from './modules/account/service';
import { createCookbookService, type CookbookService } from './modules/cookbook/service';
import { createGrowthService, type GrowthService } from './modules/growth/service';
import { createRestaurantService, type RestaurantService } from './modules/restaurant/service';
import { createShardService, type ShardService } from './modules/shard/service';
import { settlementJobs } from './modules/settlement/jobs';
import { worldJobs } from './modules/world/jobs';
import { createWorldService, type WorldService } from './modules/world/service';

/** 所有游戏服务的装配：HTTP 路由、worker、模拟器共用 */
export interface Game {
  app: AppDeps;
  deps: GameDeps;
  shards: ShardService;
  account: AccountService;
  restaurant: RestaurantService;
  world: WorldService;
  growth: GrowthService;
  cookbook: CookbookService;
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
  const world = createWorldService(deps);
  const jobs: PeriodicJob[] = [];
  jobs.push(...worldJobs(world));
  jobs.push(...settlementJobs(deps, world));
  return {
    app,
    deps,
    shards,
    account: createAccountService(app),
    restaurant: createRestaurantService(app, shards, world),
    world,
    growth: createGrowthService(deps, world),
    cookbook: createCookbookService(deps),
    jobs,
  };
}

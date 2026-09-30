import { cryptoRng } from '@dt/shared';
import type { AppDeps } from './app';
import type { GameDeps } from './core/deps';
import type { PeriodicJob } from './core/jobs';
import { createAccountService, type AccountService } from './modules/account/service';
import { statDailyJob } from './modules/admin/stats';
import { createCookbookService, type CookbookService } from './modules/cookbook/service';
import { createCupboardService, type CupboardService } from './modules/cupboard/service';
import { createSocialService, type SocialService } from './modules/friend/service';
import { equipJobs } from './modules/equip/jobs';
import { friendWeeklyJob } from './modules/friend/weekly';
import { createGrowthService, type GrowthService } from './modules/growth/service';
import { marketJobs } from './modules/market/jobs';
import { npcJobs } from './modules/npc/jobs';
import { registerNpcHandlers } from './modules/npc/npc';
import { createMarketService, type MarketService } from './modules/market/service';
import { createRestaurantService, type RestaurantService } from './modules/restaurant/service';
import { createShardService, type ShardService } from './modules/shard/service';
import { shopJobs } from './modules/shop/jobs';
import { createShopService, type ShopService } from './modules/shop/service';
import { createStoreService, type StoreService } from './modules/store/service';
import { registerTaskHandlers } from './modules/task/handler';
import { createTaskService, type TaskService } from './modules/task/service';
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
  cupboard: CupboardService;
  store: StoreService;
  shop: ShopService;
  market: MarketService;
  task: TaskService;
  social: SocialService;
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
  registerTaskHandlers(app.bus, app.config);
  registerNpcHandlers(app.bus);
  const jobs: PeriodicJob[] = [];
  jobs.push(...worldJobs(world));
  jobs.push(...settlementJobs(deps, world));
  const shop = createShopService(deps);
  jobs.push(...shopJobs(shop));
  const market = createMarketService(deps, world);
  jobs.push(...marketJobs(market));
  jobs.push(statDailyJob(app.db));
  jobs.push(...npcJobs(deps));
  jobs.push(friendWeeklyJob(deps));
  jobs.push(...equipJobs(deps));
  return {
    app,
    deps,
    shards,
    account: createAccountService(app),
    restaurant: createRestaurantService(app, shards, world),
    world,
    growth: createGrowthService(deps, world),
    cookbook: createCookbookService(deps),
    cupboard: createCupboardService(deps, world),
    store: createStoreService(deps),
    shop,
    market,
    task: createTaskService(deps),
    social: createSocialService(deps, world),
    jobs,
  };
}

import { cryptoRng } from '@dt/shared';
import type { AppDeps } from './app';
import type { GameDeps } from './core/deps';
import type { PeriodicJob } from './core/jobs';
import { createAccountService, type AccountService } from './modules/account/service';
import { statDailyJob } from './modules/admin/stats';
import { createCookbookService, type CookbookService } from './modules/cookbook/service';
import { createCupboardService, type CupboardService } from './modules/cupboard/service';
import { createSocialService, type SocialService } from './modules/friend/service';
import { effectJobs } from './modules/effects/resync';
import { equipIncomeJobs } from './modules/equip/incomeResync';
import { acquireJobs } from './modules/acquire/jobs';
import { equipJobs } from './modules/equip/jobs';
import { createEquipService, type EquipService } from './modules/equip/service';
import { friendWeeklyJob } from './modules/friend/weekly';
import { createGrowthService, type GrowthService } from './modules/growth/service';
import { marketJobs } from './modules/market/jobs';
import { npcJobs } from './modules/npc/jobs';
import { registerNpcHandlers } from './modules/npc/npc';
import { createMarketService, type MarketService } from './modules/market/service';
import { mysteriousJobs } from './modules/mysterious/jobs';
import { createMysteriousService, type MysteriousService } from './modules/mysterious/service';
import { createTempleService, type TempleService } from './modules/temple/service';
import { yardJobs } from './modules/yard/jobs';
import { towerJobs } from './modules/tower/jobs';
import { takeawayJobs } from './modules/takeaway/jobs';
import { createYardService, type YardService } from './modules/yard/service';
import { createBarService, type BarService } from './modules/bar/service';
import { createTowerService, type TowerService } from './modules/tower/service';
import { createTakeawayService, type TakeawayService } from './modules/takeaway/service';
import { createTownService, type TownService } from './modules/town/service';
import { hiphopJobs } from './modules/hiphop/jobs';
import { createHiphopService, type HiphopService } from './modules/hiphop/service';
import { createRankService, type RankService } from './modules/rank/service';
import { createForumService, type ForumService } from './modules/forum/service';
import { createActivityService, type ActivityService } from './modules/activity/service';
import { createExchangeService, type ExchangeService } from './modules/exchange/service';
import { createPredictService, type PredictService } from './modules/predict/service';
import { createKujiService, type KujiService } from './modules/kuji/service';
import { createFundService, type FundService } from './modules/fund/service';
import { createFuturesService, type FuturesService } from './modules/futures/service';
import { createAcquireService, type AcquireService } from './modules/acquire/service';
import { createMailService, type MailService } from './modules/mail/service';
import { createRedeemService, type RedeemService } from './modules/redeem/service';
import { createInviteService, type InviteService } from './modules/invite/service';
import { createReportService, type ReportService } from './modules/report/service';
import { createAnnounceService, type AnnounceService } from './modules/announce/service';
import { createRestaurantService, type RestaurantService } from './modules/restaurant/service';
import { createShardService, type ShardService } from './modules/shard/service';
import { shopJobs } from './modules/shop/jobs';
import { createShopService, type ShopService } from './modules/shop/service';
import { createStoreService, type StoreService } from './modules/store/service';
import { registerActivityHandlers } from './modules/activity/handler';
import { activityJobs } from './modules/activity/settle';
import { exchangeJobs } from './modules/exchange/jobs';
import { futuresJobs } from './modules/futures/deliver';
import { predictJobs } from './modules/predict/jobs';
import { dailyJobs } from './modules/daily/generate';
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
  equip: EquipService;
  mysterious: MysteriousService;
  temple: TempleService;
  yard: YardService;
  bar: BarService;
  tower: TowerService;
  takeaway: TakeawayService;
  town: TownService;
  hiphop: HiphopService;
  rank: RankService;
  forum: ForumService;
  mail: MailService;
  redeem: RedeemService;
  invite: InviteService;
  report: ReportService;
  announce: AnnounceService;
  activity: ActivityService;
  exchange: ExchangeService;
  predict: PredictService;
  kuji: KujiService;
  fund: FundService;
  futures: FuturesService;
  acquire: AcquireService;
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
  registerActivityHandlers(app.bus, deps);
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
  jobs.push(...effectJobs(deps));
  jobs.push(...equipIncomeJobs(deps));
  jobs.push(...acquireJobs(deps));
  jobs.push(...mysteriousJobs(deps));
  jobs.push(...yardJobs(deps, world));
  jobs.push(...towerJobs(deps));
  jobs.push(...takeawayJobs(deps));
  jobs.push(...hiphopJobs(deps));
  jobs.push(...activityJobs(deps));
  jobs.push(...exchangeJobs(deps));
  jobs.push(...futuresJobs(deps));
  jobs.push(...predictJobs(deps));
  jobs.push(...dailyJobs(deps, app.writer));
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
    equip: createEquipService(deps, world),
    mysterious: createMysteriousService(deps, world),
    temple: createTempleService(deps, world),
    yard: createYardService(deps),
    bar: createBarService(deps),
    tower: createTowerService(deps),
    takeaway: createTakeawayService(deps, world),
    town: createTownService(deps, world),
    hiphop: createHiphopService(deps, world),
    rank: createRankService(deps),
    forum: createForumService(deps),
    mail: createMailService(deps),
    redeem: createRedeemService(deps),
    invite: createInviteService(deps),
    report: createReportService(deps),
    announce: createAnnounceService(deps),
    activity: createActivityService(deps),
    exchange: createExchangeService(deps),
    predict: createPredictService(deps),
    kuji: createKujiService(deps),
    fund: createFundService(deps),
    futures: createFuturesService(deps),
    acquire: createAcquireService(deps),
    shop,
    market,
    task: createTaskService(deps),
    social: createSocialService(deps, world),
    jobs,
  };
}

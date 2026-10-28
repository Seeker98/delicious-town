import type { FastifyInstance, FastifyRequest } from 'fastify';
import { gameDay } from '@dt/shared';
import { userAgentOf } from '../core/deps';
import { outsideRequestStats } from '../infra/queryStats';
import { originOf, recordOpenCall } from './account/loginTrace';
import type { Game } from '../game';
import { accountRoutes } from './account/routes';
import { adminRoutes } from './admin/routes';
import { cookbookRoutes } from './cookbook/routes';
import { cupboardRoutes } from './cupboard/routes';
import { equipRoutes } from './equip/routes';
import { mysteriousRoutes } from './mysterious/routes';
import { templeRoutes } from './temple/routes';
import { shilingRoutes } from './shiling/routes';
import { barRoutes } from './bar/routes';
import { towerRoutes } from './tower/routes';
import { takeawayRoutes } from './takeaway/routes';
import { townRoutes } from './town/routes';
import { rankRoutes } from './rank/routes';
import { achieveRoutes } from './achieve/routes';
import { forumRoutes } from './forum/routes';
import { activityRoutes } from './activity/routes';
import { exchangeRoutes } from './exchange/routes';
import { predictRoutes } from './predict/routes';
import { kujiRoutes } from './kuji/routes';
import { fundRoutes } from './fund/routes';
import { futuresRoutes } from './futures/routes';
import { wealthRoutes } from './wealth/routes';
import { bulkRoutes } from './bulk/routes';
import { wishTreeRoutes } from './wishtree/routes';
import { randomEventRoutes } from './randomEvent/routes';
import { acquireRoutes } from './acquire/routes';
import { siteRoutes } from './site/routes';
import { createSite } from './site/service';
import { mailRoutes } from './mail/routes';
import { redeemRoutes } from './redeem/routes';
import { inviteRoutes } from './invite/routes';
import { reportRoutes } from './report/routes';
import { announceRoutes } from './announce/routes';
import { commissionRoutes } from './commission/routes';
import { socialRoutes } from './friend/routes';
import { growthRoutes } from './growth/routes';
import { marketRoutes } from './market/routes';
import { restaurantRoutes } from './restaurant/routes';
import { shardRoutes } from './shard/routes';
import { shopRoutes } from './shop/routes';
import { storeRoutes } from './store/routes';
import { taskRoutes } from './task/routes';
import { worldRoutes } from './world/routes';
import { createOpenData } from './open/data';
import { openRoutes } from './open/routes';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, game: Game): void {
  app.register(accountRoutes(game.account, game.app), { prefix: '/api/v1/account' });
  app.register(shardRoutes(game.shards), { prefix: '/api/v1/shard' });
  app.register(restaurantRoutes(game.restaurant), { prefix: '/api/v1/restaurant' });
  app.register(worldRoutes(game.world), { prefix: '/api/v1/world' });
  // 开放接口（问题记录 142）：只读的静态游戏数据，不用登录
  // 调用记录（2026-10-24）：认出谁在调开放接口；本站资料库的请求一定带 lang
  const traceOpen = (req: FastifyRequest) => {
    const q = req.query as Record<string, unknown> | undefined;
    void outsideRequestStats(() =>
      recordOpenCall(game.deps.db, {
        day: gameDay(game.deps.now()),
        ip: req.clientIp,
        userAgent: userAgentOf(req),
        origin: originOf(req.headers),
        lang: typeof q?.lang === 'string',
      }),
    ).catch((err: unknown) => req.log.warn({ err }, 'record open call failed'));
  };
  app.register(openRoutes(createOpenData(game.deps.config), game.deps.config.version, { trace: traceOpen }), {
    prefix: '/api/v1/open',
  });
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
  app.register(mysteriousRoutes(game.mysterious), { prefix: '/api/v1' });
  app.register(templeRoutes(game.temple), { prefix: '/api/v1' });
  app.register(shilingRoutes(game.shiling), { prefix: '/api/v1' });
  app.register(barRoutes(game.bar), { prefix: '/api/v1' });
  app.register(towerRoutes(game.tower), { prefix: '/api/v1' });
  app.register(takeawayRoutes(game.takeaway), { prefix: '/api/v1' });
  app.register(townRoutes(game.town), { prefix: '/api/v1' });
  app.register(rankRoutes(game.rank), { prefix: '/api/v1' });
  app.register(achieveRoutes(game.achieve), { prefix: '/api/v1' });
  app.register(forumRoutes(game.forum), { prefix: '/api/v1' });
  app.register(mailRoutes(game.mail), { prefix: '/api/v1' });
  app.register(activityRoutes(game.activity), { prefix: '/api/v1' });
  app.register(exchangeRoutes(game.exchange), { prefix: '/api/v1' });
  app.register(predictRoutes(game.predict), { prefix: '/api/v1' });
  app.register(kujiRoutes(game.kuji), { prefix: '/api/v1' });
  app.register(fundRoutes(game.fund), { prefix: '/api/v1' });
  app.register(futuresRoutes(game.futures), { prefix: '/api/v1' });
  app.register(wealthRoutes(game.wealth), { prefix: '/api/v1' });
  app.register(bulkRoutes(game.bulk), { prefix: '/api/v1' });
  app.register(wishTreeRoutes(game.wishtree), { prefix: '/api/v1' });
  app.register(randomEventRoutes(game.randomEvent), { prefix: '/api/v1' });
  app.register(acquireRoutes(game.acquire), { prefix: '/api/v1' });
  app.register(siteRoutes(createSite(game)), { prefix: '/api/v1' });
  app.register(redeemRoutes(game.redeem), { prefix: '/api/v1' });
  app.register(inviteRoutes(game.invite), { prefix: '/api/v1' });
  app.register(reportRoutes(game.report), { prefix: '/api/v1' });
  app.register(announceRoutes(game.announce), { prefix: '/api/v1' });
  app.register(commissionRoutes(game.commission), { prefix: '/api/v1' });
}

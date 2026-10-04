import type { FastifyPluginAsync } from 'fastify';
import {
  avatarBody,
  dineStartBody,
  doorBody,
  exchangeFoodsQuery,
  flipBody,
  foodsExchangeBody,
  friendListQuery,
  friendSearchQuery,
  iconBuyBody,
  iconShowBody,
  noticeBody,
  pageQuery,
  refuelBody,
  respondBody,
  restIdBody,
  restIdParam,
  restTableBody,
  tableBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { SocialService } from './service';

/** 好友互动的接口，注册在 /api/v1 下 */
export function socialRoutes(svc: SocialService): FastifyPluginAsync {
  return async (r) => {
    r.get('/friend/list', async (req) =>
      ok(await svc.reads.list(restCtxOf(req), parse(friendListQuery, req.query).sort)),
    );
    r.get('/friend/requests', async (req) => ok(await svc.reads.requests(restCtxOf(req))));
    r.get('/friend/search', async (req) =>
      ok(await svc.reads.search(restCtxOf(req), parse(friendSearchQuery, req.query).q)),
    );
    r.get('/friend/street', async (req) => ok(await svc.reads.street(restCtxOf(req))));
    r.post('/friend/apply', async (req) =>
      ok(await svc.relations.apply(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.post('/friend/respond', async (req) => {
      const b = parse(respondBody, req.body);
      return ok(await svc.relations.respond(restCtxOf(req), b.restId, b.accept));
    });
    r.post('/friend/remove', async (req) =>
      ok(await svc.relations.remove(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.get('/friend/detail/:restId', async (req) =>
      ok(await svc.reads.detail(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.get('/friend/feed', async (req) =>
      ok(await svc.reads.feed(restCtxOf(req), parse(pageQuery, req.query))),
    );
    r.get('/dine/current', async (req) => ok(await svc.dine.current(restCtxOf(req))));
    r.post('/dine/start', async (req) =>
      okOp(await svc.dine.start(restCtxOf(req), parse(dineStartBody, req.body))),
    );
    r.post('/dine/end', async (req) => okOp(await svc.dine.end(restCtxOf(req))));
    r.post('/dine/expel', async (req) =>
      okOp(await svc.dine.expel(restCtxOf(req), parse(tableBody, req.body))),
    );
    r.post('/roach/lay', async (req) =>
      okOp(await svc.roach.lay(restCtxOf(req), parse(restTableBody, req.body))),
    );
    r.post('/roach/kill', async (req) =>
      okOp(await svc.roach.kill(restCtxOf(req), parse(restTableBody, req.body))),
    );
    r.post('/friend/refuel', async (req) =>
      okOp(await svc.refuel.refuel(restCtxOf(req), parse(refuelBody, req.body))),
    );
    r.get('/friend/cupboard/:restId', async (req) =>
      ok(await svc.flip.slots(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.post('/cupboard/flip', async (req) =>
      okOp(await svc.flip.flip(restCtxOf(req), parse(flipBody, req.body))),
    );
    r.get('/friend/foods/:restId', async (req) =>
      ok(
        await svc.exchange.foods(
          restCtxOf(req),
          parse(restIdParam, req.params).restId,
          parse(exchangeFoodsQuery, req.query).level,
        ),
      ),
    );
    r.post('/foods/exchange', async (req) =>
      okOp(await svc.exchange.exchange(restCtxOf(req), parse(foodsExchangeBody, req.body))),
    );
    r.get('/thumbs/today', async (req) => ok(await svc.thumbs.today(restCtxOf(req))));
    r.post('/thumbs/up', async (req) =>
      okOp(await svc.thumbs.up(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.post('/thumbs/returnAll', async (req) => okOp(await svc.thumbs.returnAll(restCtxOf(req))));
    r.get('/rest/looks', async (req) => ok(await svc.looks.mine(restCtxOf(req))));
    r.post('/rest/door', async (req) =>
      okOp(await svc.looks.door(restCtxOf(req), parse(doorBody, req.body).door)),
    );
    r.post('/rest/avatar', async (req) =>
      okOp(await svc.looks.avatar(restCtxOf(req), parse(avatarBody, req.body).avatar)),
    );
    r.post('/rest/notice', async (req) =>
      okOp(await svc.looks.notice(restCtxOf(req), parse(noticeBody, req.body).text)),
    );
    r.post('/rest/icon/buy', async (req) =>
      okOp(await svc.looks.buyIcon(restCtxOf(req), parse(iconBuyBody, req.body).key)),
    );
    r.post('/rest/icon/show', async (req) => {
      const b = parse(iconShowBody, req.body);
      return okOp(await svc.looks.iconShow(restCtxOf(req), b.iconId, b.shown));
    });
  };
}

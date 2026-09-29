import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { DB } from '../db/schema';
import type { EventBus } from '../events/bus';
import type { ShardService } from '../modules/shard/service';
import { requireRestaurant } from '../security/session';

/** 游戏服务需要的依赖（HTTP 与模拟器共用） */
export interface GameDeps {
  db: Kysely<DB>;
  redis: Redis;
  config: GameConfig;
  bus: EventBus;
  now: () => Date;
  /** 每个操作取一个新的随机源 */
  rng: () => Rng;
  shards: ShardService;
}

/** 当前操作的玩家与餐厅，一律来自会话 */
export interface RestCtx {
  accountId: number;
  shardId: number;
  restaurantId: number;
  ip: string;
  deviceId: string | null;
}

const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;

export function restCtxOf(req: FastifyRequest): RestCtx {
  const r = requireRestaurant(req);
  const dev = req.headers['x-device-id'];
  return {
    accountId: r.accountId,
    shardId: r.shardId,
    restaurantId: r.restaurantId,
    ip: req.clientIp,
    deviceId: typeof dev === 'string' && DEVICE_RE.test(dev) ? dev : null,
  };
}

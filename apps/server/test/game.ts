import type { Kysely } from 'kysely';
import type { AppDeps } from '../src/app';
import type { RestCtx } from '../src/core/deps';
import { createDb } from '../src/db';
import type { DB, RestaurantRow } from '../src/db/schema';
import { EventBus } from '../src/events/bus';
import { createGame, type Game } from '../src/game';
import { fixedCaptcha } from '../src/infra/captcha';
import { memoryMailer } from '../src/infra/mailer';
import { createRedis } from '../src/infra/redis';
import { createSessionStore } from '../src/security/sessionStore';
import { testConfig } from './config';
import { createAccountRow, createRestaurantFull, createShard, type FullRestaurantOptions } from './fixtures';
import { GENEROUS_RULES, testEnvWith } from './helpers';

export interface TestClock {
  now: Date;
  set(d: Date): void;
  advance(ms: number): void;
}

export interface TestGame {
  game: Game;
  deps: AppDeps;
  db: Kysely<DB>;
  clock: TestClock;
  close(): Promise<void>;
}

/** 不启动 HTTP，直接调用服务；时间由 clock 控制 */
export async function createTestGame(overrides: Partial<AppDeps> = {}): Promise<TestGame> {
  const env = testEnvWith();
  const db = createDb(env.DATABASE_URL, 5);
  const redis = createRedis(env.REDIS_URL);
  const clock: TestClock = {
    now: new Date(),
    set(d) {
      this.now = d;
    },
    advance(ms) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: testConfig(),
    mailer: memoryMailer(),
    captcha: fixedCaptcha(true),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: () => clock.now,
    rateRules: GENEROUS_RULES,
    ...overrides,
  };
  const game = createGame(deps);
  return {
    game,
    deps,
    db,
    clock,
    close: async () => {
      await db.destroy();
      redis.disconnect();
    },
  };
}

export interface NewRestaurantOptions extends FullRestaurantOptions {
  shardId?: number;
  /** 食材 id → 橱柜数量 */
  foods?: Record<number, number>;
  /** 道具 id → 数量（直接写仓库，不写加成来源；勋章请用 grantGoods） */
  goods?: Record<number, number>;
  verified?: boolean;
}

export async function newRestaurant(t: TestGame, opts: NewRestaurantOptions = {}): Promise<RestCtx> {
  const shardId = opts.shardId ?? (await createShard(t.db));
  const accountId = await createAccountRow(t.db);
  if (opts.verified) {
    await t.db
      .updateTable('account')
      .set({ email_verified_at: new Date() })
      .where('id', '=', accountId)
      .execute();
  }
  const restaurantId = await createRestaurantFull(t.db, shardId, accountId, opts);
  for (const [id, num] of Object.entries(opts.foods ?? {})) {
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: restaurantId, foods_id: Number(id), num })
      .execute();
  }
  for (const [id, num] of Object.entries(opts.goods ?? {})) {
    await t.db
      .insertInto('store_item')
      .values({ rest_id: restaurantId, goods_id: Number(id), num })
      .execute();
  }
  return { accountId, shardId, restaurantId, ip: '127.0.0.1', deviceId: null };
}

export async function restRow(t: TestGame, restId: number): Promise<RestaurantRow> {
  return t.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
}

export async function goodsNum(t: TestGame, restId: number, goodsId: number): Promise<number> {
  const r = await t.db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

export async function foodNum(
  t: TestGame,
  restId: number,
  foodsId: number,
): Promise<{ num: number; fridge: number }> {
  const r = await t.db
    .selectFrom('cupboard_food')
    .select(['num', 'fridge_num'])
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return { num: r?.num ?? 0, fridge: r?.fridge_num ?? 0 };
}

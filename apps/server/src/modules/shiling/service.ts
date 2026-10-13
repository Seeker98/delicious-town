import type { Kysely } from 'kysely';
import { GOODS, type GameConfig, type MysteriousCookbook, type Tuning } from '@dt/config';
import type {
  SeasonDto,
  ShilingBuyResultDto,
  ShilingDto,
  ShilingItem,
  ShilingShopItemDto,
  ShilingWeekDto,
  TownRewardDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { emitAction } from '../../core/action';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { badInput } from '../temple/common';
import { runOp, type Op, type OpResult } from '../../core/op';
import type { DB } from '../../db/schema';
import { featureAvailable } from '../../core/features';
import { cardBlock, cardGate, weekEndAt } from '../jobcard/rules';
import { weekGains } from '../jobcard/weekly';
import { addRemnant } from '../mysterious/remnant';
import { rankRows } from '../rank/ranking';
import { grantGoodsOp } from '../store/goods';
import { topForecast } from '../world/rules';
import type { WorldService } from '../world/service';
import { roadsOf } from './rules';
import { shilingBalance, shilingOf, shilingWeek, spendShiling } from './store';

const ITEMS: readonly ShilingItem[] = ['remnant', 'rare', 'compass', 'lots'];
const counterKey = (item: ShilingItem) => `shiling.buy:${item}`;

/** 时令铺能选的菜（天气改版设计 §3.4）：残卷是可鉴定的 1~5 级；珍稀残卷是不能鉴定的和 6 级的；都要还没学会 */
export function shopPools(
  all: readonly MysteriousCookbook[],
  learned: ReadonlySet<number>,
): { remnant: number[]; rare: number[] } {
  const open = all.filter((m) => !learned.has(m.id));
  return {
    remnant: open.filter((m) => m.appraisable && m.level <= 5).map((m) => m.id),
    rare: open.filter((m) => !m.appraisable || m.level >= 6).map((m) => m.id),
  };
}

function shopRows(t: Tuning['shiling'], bought: ReadonlyMap<string, number>): ShilingShopItemDto[] {
  const s = t.shop;
  const row = (
    item: ShilingItem,
    price: number,
    weekly: number,
    goodsId: number | null,
  ): ShilingShopItemDto => ({
    item,
    price,
    perLevel: item === 'remnant',
    goodsId,
    weekly,
    left: Math.max(0, weekly - (bought.get(counterKey(item)) ?? 0)),
  });
  return [
    row('remnant', s.remnantPerLevel, s.remnantWeekly, null),
    row('rare', s.rarePrice, s.rareWeekly, null),
    row('compass', s.compass[0], s.compass[1], GOODS.compass),
    row('lots', s.lots[0], s.lots[1], GOODS.weatherLots),
  ];
}

async function boughtThisWeek(db: Kysely<DB>, restId: number, now: Date): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('weekly_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', restId)
    .where('week', '=', shilingWeek(now))
    .where(
      'key',
      'in',
      ITEMS.map((i) => counterKey(i)),
    )
    .execute();
  return new Map(rows.map((r) => [r.key, r.count]));
}

/**
 * 当令表的行（§3.1）：日夜对应的天气合成一行（白天的在前），特殊天气合成一行放最后；其他按类型、编号排
 */
export function seasonTable(
  config: GameConfig,
  t: Tuning['shiling'],
): Array<{ ids: number[]; roads: number[] }> {
  const night = new Map(config.bundle.weatherChain.counter.map(([day, n]) => [n, day]));
  const rows = new Map<number, { ids: number[]; roads: number[] }>();
  const special: number[] = [];
  const weathers = [...config.weather.values()].sort((a, b) => a.type - b.type || a.id - b.id);
  for (const w of weathers) {
    if (w.special) {
      special.push(w.id);
      continue;
    }
    const day = night.get(w.id);
    const row = day !== undefined ? rows.get(day) : undefined;
    if (row) row.ids.push(w.id);
    else rows.set(w.id, { ids: [w.id], roads: roadsOf(t, w.id) });
  }
  special.sort((a, b) => a - b);
  return [...rows.values(), ...(special.length ? [{ ids: special, roads: roadsOf(t, special[0]!) }] : [])];
}

/** 现在的当令：生效天气（道具盖着按盖的）、到几点、下一轮最可能的类型 */
export async function seasonOf(
  world: WorldService,
  t: Tuning['shiling'],
  shardId: number,
  star: number,
  now: Date,
): Promise<SeasonDto> {
  const snap = await world.ensure(shardId, now);
  return {
    open: star >= t.minStar,
    minStar: t.minStar,
    weatherId: snap.weather.id,
    roads: roadsOf(t, snap.weather.id),
    until: snap.weatherUntil.toISOString(),
    next: topForecast(await world.forecast(shardId, snap)),
  };
}

/** 工资礼包里的东西：道具按个数，银币按数额（工资礼包都是必得的） */
function wageItems(config: GameConfig, wageId: number): TownRewardDto[] {
  return (config.goods.get(wageId)?.gift ?? []).flatMap((g): TownRewardDto[] =>
    g.type === 'goods'
      ? [{ kind: 'goods', id: g.id, num: g.num }]
      : g.type === 'coin'
        ? [{ kind: 'coin', id: null, num: g.min }]
        : [],
  );
}

export function createShilingService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'mysterious', source }, fn);
  const config: GameConfig = d.config;

  return {
    async view(ctx: RestCtx): Promise<ShilingDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const t = s.tuning.shiling;
      const now = d.now();
      const rid = ctx.restaurantId;
      const [rest, mine, learned, remnants, bought, gains] = await Promise.all([
        d.db.selectFrom('restaurant').select('star_level').where('id', '=', rid).executeTakeFirstOrThrow(),
        shilingOf(d.db, rid, now),
        d.db.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', rid).execute(),
        d.db
          .selectFrom('mc_remnant')
          .select(['mc_id', 'num'])
          .where('rest_id', '=', rid)
          .where('num', '>', 0)
          .execute(),
        boughtThisWeek(d.db, rid, now),
        weekGains(d.db, ctx.shardId, shilingWeek(now)),
      ]);
      const season = await seasonOf(world, t, ctx.shardId, rest.star_level, now);
      const learnedIds = new Set(learned.map((r) => r.mc_id));
      const learnedMc = [...learnedIds].flatMap((id) => config.mysterious.get(id) ?? []);
      const pools = shopPools(config.bundle.mysteriousCookbooks, learnedIds);
      return {
        season,
        balance: mine.balance,
        decay: { rate: t.decay.rate, floor: t.decay.floor },
        weekGain: mine.weekGain,
        inSeason: season.open
          ? learnedMc
              .filter((m) => season.roads.includes(m.road))
              .map((m) => m.id)
              .sort((a, b) => a - b)
          : [],
        shop: shopRows(t, bought),
        remnantPool: pools.remnant,
        rarePool: pools.rare,
        remnants: remnants.map((r) => ({ mcId: r.mc_id, num: r.num })),
        table: seasonTable(config, t),
        myRoads: [...new Set(learnedMc.map((m) => m.road))].sort((a, b) => a - b),
        trialPick: t.trialPick,
        week: {
          rank: rankRows(gains).find((r) => r.restId === rid)?.rank ?? null,
          minGain: s.tuning.jobCard.minGain,
          count: s.tuning.jobCard.count,
        },
      };
    },

    /** 时令周榜（PR③）：本周排名（前 count + 2 名和自己）、门槛、11 张证和你能不能抽到 */
    async week(ctx: RestCtx): Promise<ShilingWeekDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const t = s.tuning.jobCard;
      const now = d.now();
      const week = shilingWeek(now);
      const [rest, gains] = await Promise.all([
        d.db
          .selectFrom('restaurant')
          .select(['level', 'star_level'])
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
        weekGains(d.db, ctx.shardId, week),
      ]);
      const ranked = rankRows(gains);
      const me = ranked.find((r) => r.restId === ctx.restaurantId);
      return {
        week,
        until: weekEndAt(week, t.hour).toISOString(),
        count: t.count,
        minGain: t.minGain,
        top: ranked
          .slice(0, t.count + 2)
          .map((r) => ({ rank: r.rank, restId: r.restId, name: r.name, gain: r.value })),
        me: { rank: me?.rank ?? null, gain: me?.value ?? 0 },
        cards: t.cards.map(([goodsId, wageId]) => ({
          goodsId,
          wageId,
          wage: wageItems(config, wageId),
          block: cardBlock(cardGate(goodsId, s.tuning), (f) => featureAvailable(s, f), {
            level: rest.level,
            star: rest.star_level,
          }),
        })),
      };
    },

    /** 时令铺换一件（§3.4）：够星；每周限购；残卷要选一道还没学会、在这一栏范围里的菜 */
    buy(ctx: RestCtx, b: { item: ShilingItem; mcId?: number }) {
      return op(ctx, 'shiling.buy', async (o): Promise<ShilingBuyResultDto> => {
        const t = o.tuning.shiling;
        if (o.rest.star_level < t.minStar)
          throw requirement('star', { need: t.minStar, have: o.rest.star_level });
        const row = shopRows(t, await boughtThisWeek(o.tx, o.rest.id, o.now)).find((x) => x.item === b.item)!;
        if (row.left <= 0) throw limitReached('shiling_weekly', { limit: row.weekly });
        let mcId: number | null = null;
        if (b.item === 'remnant' || b.item === 'rare') {
          const mc = b.mcId === undefined ? undefined : config.mysterious.get(b.mcId);
          if (!mc) throw badInput('mc_id');
          const learned = await o.tx
            .selectFrom('rest_mc')
            .select('mc_id')
            .where('rest_id', '=', o.rest.id)
            .where('mc_id', '=', mc.id)
            .executeTakeFirst();
          if (learned) throw invalidState('mc_learned');
          const pools = shopPools([mc], new Set());
          if (!(b.item === 'remnant' ? pools.remnant : pools.rare).includes(mc.id))
            throw invalidState('shiling_not_in_shop');
          await spendShiling(o, b.item === 'remnant' ? row.price * mc.level : row.price);
          await addRemnant(o, mc.id, 1);
          mcId = mc.id;
        } else {
          await spendShiling(o, row.price);
          await grantGoodsOp(o, b.item === 'compass' ? GOODS.compass : GOODS.weatherLots, 1);
        }
        await o.tx
          .insertInto('weekly_counter')
          .values({ rest_id: o.rest.id, week: shilingWeek(o.now), key: counterKey(b.item), count: 1 })
          .onConflict((oc) =>
            oc
              .columns(['rest_id', 'week', 'key'])
              .doUpdateSet((eb) => ({ count: eb('weekly_counter.count', '+', 1) })),
          )
          .execute();
        await emitAction(o, 'shiling.buy');
        return { item: b.item, mcId, balance: await shilingBalance(o.tx, o.rest.id) };
      });
    },

    /** 1 星说明弹窗看过了（只记一次） */
    async introSeen(ctx: RestCtx): Promise<void> {
      await d.db
        .insertInto('rest_shiling')
        .values({ rest_id: ctx.restaurantId, shard_id: ctx.shardId, intro_at: d.now() })
        .onConflict((oc) =>
          oc
            .column('rest_id')
            .doUpdateSet((eb) => ({ intro_at: eb.fn.coalesce('rest_shiling.intro_at', eb.val(d.now())) })),
        )
        .execute();
    },
  };
}

export type ShilingService = ReturnType<typeof createShilingService>;

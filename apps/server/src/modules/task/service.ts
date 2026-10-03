import type { Kysely } from 'kysely';
import { DEVICE_TYPE, GOODS, type Award, type Quest, type QuestCond, type ShardSettings } from '@dt/config';
import {
  addDays,
  ErrorCode,
  gameDay,
  gameTime,
  weekStart,
  type ActivationDto,
  type QuestDto,
  type QuestsDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { invalidState, requirement } from '../../core/errors';
import { runOp, setRest, type Op } from '../../core/op';
import { withRestaurant } from '../../db/tx';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { incrementDaily } from '../counter/dailyCounter';
import { listActiveEffects } from '../effects/service';
import { normalizeCounts } from '../settlement/globals';
import { grantGoodsOp, hasValidHonor } from '../store/goods';
import {
  CHAPTER_MARK,
  convertOld,
  counterOf,
  foreignLearned,
  isNewContent,
  lineViews,
  mainView,
  reachedChapter,
  weeklyGroupFor,
  type QuestCtx,
} from './quests';
import { activationTotal, stateValue } from './rules';

const SIGNIN_KEY = 'signin';
const claimKey = (points: number) => `act.claim:${points}`;

export function createTaskService(d: GameDeps) {
  const { chapters, quests, questLines, weeklyGroups } = d.config.bundle;
  const questById = new Map(quests.map((q) => [q.id, q]));

  /** 玩家事务里调用时传 o.tx 和 o.settings，不能另向连接池要连接 */
  async function snapshot(db: Kysely<DB>, rest: RestaurantRow, known?: ShardSettings) {
    // 在调用方的事务里读区服设置：换算时持有行锁，不能另向连接池要连接（终审 Important 3）
    const settings = known ?? (await d.shards.settings(rest.shard_id, db));
    // "领一次限时活动奖励"：区服当前没有本店能参加的进行中活动时按做不了算，不挡主线（终审 Important 2）
    const now = d.now();
    const running = await db
      .selectFrom('activity')
      .select('id')
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('shard_id', '=', rest.shard_id), eb('shard_id', 'is', null)]))
      .where('starts_at', '<=', now)
      .where('ends_at', '>', now)
      .where('min_level', '<=', rest.level)
      .limit(1)
      .executeTakeFirst();
    const available = (f: string) =>
      featureAvailable(settings, f) && (f !== 'activity' || running !== undefined);
    const done = new Set(
      (await db.selectFrom('quest_done').select('quest_id').where('rest_id', '=', rest.id).execute()).map(
        (r) => r.quest_id,
      ),
    );
    const counters = Object.fromEntries(
      (
        await db.selectFrom('event_counter').select(['key', 'count']).where('rest_id', '=', rest.id).execute()
      ).map((r) => [r.key, r.count]),
    );
    const counts = normalizeCounts(rest.cookbook_counts);
    const friends = await db
      .selectFrom('friend')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
    const maxStress = await db
      .selectFrom('equip')
      .select((eb) => eb.fn.max('stress').as('m'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirst();
    const mcLearned = await db
      .selectFrom('rest_mc')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
    const lands = await db
      .selectFrom('yard_land')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
    // 有效盆栽勋章的种数，和"集盆栽"加成同一套计数（4C-1 设计文档裁定 10）
    const pots = (await listActiveEffects(db, rest.id, d.now())).filter(
      (s) => s.sourceType === 'honor' && d.config.goods.get(s.sourceId)?.deviceType === DEVICE_TYPE.pot,
    ).length;
    const takeaway = await db
      .selectFrom('takeaway_state')
      .select('rest_id')
      .where('rest_id', '=', rest.id)
      .executeTakeFirst();
    const extra = {
      'friends.count': Number(friends.n),
      'rest.thumbs': counters['thumbs.received'] ?? 0,
      'equip.maxStress': Number(maxStress?.m ?? 0),
      'mc.learned': Number(mcLearned.n),
      'yard.lands': Number(lands.n),
      'honor.potCount': pots,
      'takeaway.open': takeaway ? 1 : 0,
      'cookbooks.foreignLearned': foreignLearned(counts.street),
    };
    const progress = (c: QuestCond) =>
      c.kind === 'counter' ? counterOf(c.key, counters) : (stateValue(c.key, rest, counts, extra) ?? 0);
    const ctx: QuestCtx = { level: rest.level, star: rest.star_level, done, progress, available };
    const main = mainView(chapters, quests, ctx);
    const lines = lineViews(questLines, quests, ctx, reachedChapter(main, chapters));
    return { ctx, main, lines, available };
  }

  /**
   * 老号换算（问题记录 318，设计 §9）：第一次打开任务时，整章已达成的章记完成（不发奖励，章末留着可领）。
   * 调用方已锁住这家店（withRestaurant / runOp），并发打开也只换算一次
   */
  async function convert(db: Kysely<DB>, rest: RestaurantRow, settings?: ShardSettings): Promise<boolean> {
    if (rest.quest_version !== 0) return false;
    const s = await snapshot(db, rest, settings);
    const ids = convertOld(chapters, quests, s.ctx, isNewContent);
    if (ids.length > 0)
      await db
        .insertInto('quest_done')
        .values(ids.map((quest_id) => ({ rest_id: rest.id, quest_id, done_at: d.now() })))
        .onConflict((oc) => oc.doNothing())
        .execute();
    return true;
  }
  async function ensureConverted(o: Op): Promise<void> {
    if (await convert(o.tx, o.rest, o.settings)) setRest(o, 'quest_version', 1);
  }

  /** 本周任务：按当前星级分组，区服关掉的功能不列 */
  async function weeklyOf(db: Kysely<DB>, rest: RestaurantRow, available: (f: string) => boolean) {
    const group = weeklyGroupFor(weeklyGroups, rest.star_level);
    if (!group) return null;
    const list = group.quests.filter((q) => available(q.feature));
    if (list.length === 0) return null;
    const week = weekStart(gameDay(d.now()));
    const counter = new Map(
      (
        await db
          .selectFrom('weekly_counter')
          .select(['key', 'count'])
          .where('rest_id', '=', rest.id)
          .where('week', '=', week)
          .execute()
      ).map((r) => [r.key, r.count]),
    );
    const claimed = new Set(
      (
        await db
          .selectFrom('weekly_claim')
          .select('quest_id')
          .where('rest_id', '=', rest.id)
          .where('week', '=', week)
          .execute()
      ).map((r) => r.quest_id),
    );
    return { group, week, list, counter, claimed, allClaimed: list.every((q) => claimed.has(q.id)) };
  }

  const questDto = (q: Quest, progress: number, claimed: boolean): QuestDto => ({
    id: q.id,
    name: q.name,
    href: q.href,
    key: q.cond.key,
    target: q.cond.target,
    progress,
    done: progress >= q.cond.target,
    claimed,
    award: q.award,
  });

  async function questsOf(db: Kysely<DB>, rest: RestaurantRow): Promise<QuestsDto> {
    const s = await snapshot(db, rest);
    const { done, progress } = s.ctx;
    const ch = s.main.chapter;
    const w = await weeklyOf(db, rest, s.available);
    return {
      chapter: ch && {
        id: ch.id,
        name: ch.name,
        needLevel: ch.needLevel,
        needStar: ch.needStar,
        locked: s.main.locked,
        award: ch.award,
        claimable: s.main.chapterClaimable,
        total: s.main.quests.length,
        claimedCount: s.main.quests.filter((q) => done.has(q.id)).length,
      },
      main: s.main.quests.map((q) => questDto(q, progress(q.cond), done.has(q.id))),
      allMainDone: s.main.allDone,
      lines: s.lines.map((l) => ({
        id: l.line.id,
        name: l.line.name,
        quest: l.quest && questDto(l.quest, progress(l.quest.cond), false),
        lockedStar: l.lockedStar,
        doneCount: l.doneCount,
        total: l.total,
      })),
      weekly: w && {
        group: w.group.key,
        week: w.week,
        endsAt: gameTime(addDays(w.week, 7), 0).toISOString(),
        quests: w.list.map((q) => ({
          id: q.id,
          name: q.name,
          href: q.href,
          key: q.key,
          target: q.target,
          progress: w.counter.get(q.key) ?? 0,
          done: (w.counter.get(q.key) ?? 0) >= q.target,
          claimed: w.claimed.has(q.id),
          award: q.award,
        })),
        full: {
          id: w.group.fullId,
          award: w.group.fullAward,
          claimable: w.allClaimed && !w.claimed.has(w.group.fullId),
          claimed: w.claimed.has(w.group.fullId),
        },
      },
    };
  }

  /** 领每周任务或全完成奖励（按领取时的星级分组，设计 §6） */
  async function claimWeekly(o: Op, id: number) {
    const w = await weeklyOf(o.tx, o.rest, (f) => featureAvailable(o.settings, f));
    if (!w) throw invalidState('not_visible', { taskId: id });
    let award: Award;
    if (id === w.group.fullId) {
      if (w.claimed.has(id)) throw new AppError(ErrorCode.ALREADY_DONE, 400);
      const n = w.list.filter((q) => w.claimed.has(q.id)).length;
      if (n < w.list.length) throw requirement('task', { progress: n, target: w.list.length });
      award = w.group.fullAward;
    } else {
      const q = w.list.find((x) => x.id === id);
      if (!q) throw invalidState('not_visible', { taskId: id });
      if (w.claimed.has(id)) throw new AppError(ErrorCode.ALREADY_DONE, 400);
      const progress = w.counter.get(q.key) ?? 0;
      if (progress < q.target) throw requirement('task', { progress, target: q.target });
      award = q.award;
    }
    await grantAward(o, award, { source: 'task.weekly' });
    await o.tx
      .insertInto('weekly_claim')
      .values({ rest_id: o.rest.id, week: w.week, quest_id: id })
      .execute();
  }

  async function activationOf(db: Kysely<DB>, rest: RestaurantRow, day: string): Promise<ActivationDto> {
    const rows = await db
      .selectFrom('daily_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', rest.id)
      .where('day', '=', day)
      .execute();
    const byKey = new Map(rows.map((r) => [r.key, r.count]));
    const acts = d.config.bundle.activationTasks.filter((a) => a.limitTimes > 0);
    const counts = new Map(acts.map((a) => [a.id, byKey.get(`act:${a.id}`) ?? 0]));
    const necklace = await db
      .selectFrom('store_item')
      .select('expires_at')
      .where('rest_id', '=', rest.id)
      .where('goods_id', '=', GOODS.loveNecklace)
      .executeTakeFirst();
    const multiplier = necklace && (necklace.expires_at === null || necklace.expires_at > d.now()) ? 2 : 1;
    return {
      total: activationTotal(acts, counts),
      signedIn: (byKey.get(SIGNIN_KEY) ?? 0) > 0,
      signInGift: GOODS.signInGift,
      star: rest.star_level,
      items: acts.map((a) => ({
        id: a.id,
        name: a.name,
        points: a.points,
        limit: a.limitTimes,
        count: counts.get(a.id) ?? 0,
        needStar: a.needStar,
      })),
      rewards: d.config.bundle.activationRewards.map((r) => ({
        points: r.points,
        award: r.award,
        claimed: (byKey.get(claimKey(r.points)) ?? 0) > 0,
        multiplier,
      })),
    };
  }

  /** 活跃奖励：经验按 × 餐厅等级（规格书 15 §15.2） */
  const scaled = (a: Award, level: number): Award => (a.exp ? { ...a, exp: a.exp * level } : a);

  return {
    /** 任务列表（问题记录 318）：老号第一次打开时先锁店换算 */
    async tasks(ctx: RestCtx): Promise<QuestsDto> {
      let rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      if (rest.quest_version === 0)
        rest = await withRestaurant(d.db, ctx.restaurantId, async (tx, locked) => {
          if (await convert(tx, locked)) {
            await tx
              .updateTable('restaurant')
              .set({ quest_version: 1 })
              .where('id', '=', locked.id)
              .execute();
            return { ...locked, quest_version: 1 };
          }
          return locked;
        });
      return questsOf(d.db, rest);
    },

    /** 领主线任务、支线当前档、每周任务或每周全完成奖励（按 id 区间分辨） */
    claimTask(ctx: RestCtx, taskId: number) {
      return runOp(d, ctx, { feature: 'task', source: 'task' }, async (o: Op) => {
        await ensureConverted(o);
        const q = questById.get(taskId);
        if (!q) {
          await claimWeekly(o, taskId);
          return { taskId };
        }
        const s = await snapshot(o.tx, o.rest, o.settings);
        const visible =
          q.line === null
            ? !s.main.locked && s.main.quests.some((x) => x.id === taskId)
            : s.lines.some((l) => l.quest?.id === taskId);
        if (!visible) throw invalidState('not_visible', { taskId });
        if (s.ctx.done.has(taskId)) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        if (o.rest.star_level < q.needStar) throw requirement('star', { need: q.needStar });
        const progress = s.ctx.progress(q.cond);
        if (progress < q.cond.target) throw requirement('task', { progress, target: q.cond.target });
        await grantAward(o, q.award, { source: q.line === null ? 'task.main' : 'task.side' });
        await o.tx
          .insertInto('quest_done')
          .values({ rest_id: o.rest.id, quest_id: taskId, done_at: o.now })
          .execute();
        return { taskId };
      });
    },

    /** 领章末奖励：本章任务都领了才能领 */
    claimChapter(ctx: RestCtx, chapterId: number) {
      return runOp(d, ctx, { feature: 'task', source: 'task' }, async (o: Op) => {
        await ensureConverted(o);
        const s = await snapshot(o.tx, o.rest, o.settings);
        const ch = s.main.chapter;
        if (!ch || ch.id !== chapterId || s.main.locked) throw invalidState('not_visible', { chapterId });
        if (!s.main.chapterClaimable) {
          const n = s.main.quests.filter((q) => s.ctx.done.has(q.id)).length;
          throw requirement('task', { progress: n, target: s.main.quests.length });
        }
        await grantAward(o, ch.award, { source: 'task.chapter' });
        await o.tx
          .insertInto('quest_done')
          .values({ rest_id: o.rest.id, quest_id: CHAPTER_MARK + ch.id, done_at: o.now })
          .execute();
        return { chapterId };
      });
    },

    async activation(ctx: RestCtx): Promise<ActivationDto> {
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return activationOf(d.db, rest, gameDay(d.now()));
    },

    claimActivation(ctx: RestCtx, points: number) {
      return runOp(d, ctx, { feature: 'task', source: 'activation' }, async (o) => {
        const reward = o.config.bundle.activationRewards.find((r) => r.points === points);
        if (!reward) throw invalidState('no_reward', { points });
        const day = gameDay(o.now);
        const a = await activationOf(o.tx, o.rest, day);
        if (a.total < points) throw requirement('activation', { need: points, have: a.total });
        if ((await incrementDaily(o.tx, o.rest.id, claimKey(points), 1, day)) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        const multiplier = (await hasValidHonor(o, GOODS.loveNecklace)) ? 2 : 1;
        await grantAward(o, scaled(reward.award, o.rest.level), { multiplier });
        // 一番赏（一番赏设计 §5.5）：领 activeTicketPoints 这一档额外送券（问题记录 318：新增 180 档后仍在 150 档）；
        // 区服关掉一番赏不送
        let kujiTickets = 0;
        if (
          points === o.tuning.kuji.activeTicketPoints &&
          featureAvailable(o.settings, 'kuji') &&
          o.tuning.kuji.activeTickets > 0
        )
          kujiTickets = await grantGoodsOp(o, GOODS.kujiTicket, o.tuning.kuji.activeTickets, {
            source: 'activation',
          });
        return { points, kujiTickets };
      });
    },

    signIn(ctx: RestCtx) {
      return runOp(d, ctx, { feature: 'task', source: 'signin' }, async (o) => {
        if ((await incrementDaily(o.tx, o.rest.id, SIGNIN_KEY, 1, gameDay(o.now))) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        await grantGoodsOp(o, GOODS.signInGift, 1);
        await emitAction(o, 'signin');
        return { signedIn: true };
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;

import { sql, type Kysely } from 'kysely';
import {
  GOODS,
  type Award,
  type GameConfig,
  type Quest,
  type QuestCond,
  type ShardSettings,
  type Tuning,
} from '@dt/config';
import {
  addDays,
  ErrorCode,
  gameDay,
  gameTime,
  weekStart,
  type ActivationBlock,
  type ActivationDto,
  type QuestDto,
  type QuestsDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { invalidState, requirement } from '../../core/errors';
import { restLog, runOp, setRest, type Op } from '../../core/op';
import { withRestaurant } from '../../db/tx';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { collectionCounts } from '../effects/aggregate';
import { incrementDaily } from '../counter/dailyCounter';
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
import { activationTotal, questVars, stateValue } from './rules';
import { eligibilityOf } from '../exchange/eligibility';

const SIGNIN_KEY = 'signin';
const claimKey = (points: number) => `act.claim:${points}`;

/**
 * 本店眼下能拿到“领取限时活动奖励”的活动（SQL 条件，别名 a）：没删、本区服或全服、已开始、等级够；
 * 全服加成没有奖励，不算；进行中，或兑换活动还在兑换期（ends_at + graceHours，见 activity/rules exchangeUntil）
 */
function claimableActivity(rest: Pick<RestaurantRow, 'shard_id' | 'level'>, now: Date) {
  return sql<boolean>`exists(select 1 from activity a where a.deleted_at is null
    and (a.shard_id = ${rest.shard_id} or a.shard_id is null) and a.kind <> 'boost'
    and a.starts_at <= ${now} and a.min_level <= ${rest.level}
    and (a.ends_at > ${now} or (a.kind = 'exchange'
      and a.ends_at + coalesce((a.def->>'graceHours')::int, 24) * interval '1 hour' > ${now})))`;
}

/** 支线“收藏”的三个状态（问题记录 515）：和加成汇总同一个口径 */
function collectionOf(owned: number[], honors: number[], config: GameConfig) {
  const c = collectionCounts(owned, honors, config);
  return {
    'collection.plaques': c.plaques,
    'collection.honors': c.honors,
    'collection.paintings': c.paintings,
  };
}

/** 连续签到（支线“签到和活跃”，问题记录 515）：昨天签过的接着数，否则从 1 开始；最长的留着 */
async function recordStreak(db: Kysely<DB>, restId: number, day: string): Promise<void> {
  const prev = await db
    .selectFrom('signin_streak')
    .select(['last_day', 'streak', 'best'])
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  const streak = prev?.last_day === addDays(day, -1) ? prev.streak + 1 : 1;
  const row = { last_day: day, streak, best: Math.max(prev?.best ?? 0, streak) };
  await db
    .insertInto('signin_streak')
    .values({ rest_id: restId, ...row })
    .onConflict((oc) => oc.column('rest_id').doUpdateSet(row))
    .execute();
}

/** 活跃项编号（activation_extra.json、原版活跃表） */
const ACT_EXCHANGE = 901;
const ACT_PREDICT = 902;
const ACT_ACTIVITY = 904;
const ACT_TAKEAWAY = 50;

export function createTaskService(d: GameDeps) {
  const { chapters, quests, questLines, weeklyGroups } = d.config.bundle;
  const questById = new Map(quests.map((q) => [q.id, q]));

  /** 玩家事务里调用时传 o.tx 和 o.settings，不能另向连接池要连接 */
  async function snapshot(db: Kysely<DB>, rest: RestaurantRow, known?: ShardSettings) {
    // 在调用方的事务里读区服设置：换算时持有行锁，不能另向连接池要连接（终审 Important 3）
    const settings = known ?? (await d.shards.settings(rest.shard_id, db));
    // "领一次限时活动奖励"：区服当前没有本店能参加的进行中活动时按做不了算，不挡主线（终审 Important 2）
    const now = d.now();
    // 本店的几项计数一条查询读完（质量期 ③：原来 8 条；这里可能在调用方的事务里跑，不能并发，所以合成子查询）
    const facts = await db
      .selectNoFrom([
        claimableActivity(rest, now).as('running'),
        sql<
          number[]
        >`coalesce((select array_agg(quest_id) from quest_done where rest_id = ${rest.id}), '{}')`.as('done'),
        sql<
          Record<string, number>
        >`coalesce((select jsonb_object_agg(key, count) from event_counter where rest_id = ${rest.id}), '{}'::jsonb)`.as(
          'counters',
        ),
        sql<number>`(select count(*) from friend where rest_id = ${rest.id})`.as('friends'),
        sql<number | null>`(select max(stress) from equip where rest_id = ${rest.id})`.as('maxStress'),
        sql<number>`(select count(*) from rest_mc where rest_id = ${rest.id})`.as('mcLearned'),
        sql<number>`(select count(*) from yard_land where rest_id = ${rest.id})`.as('lands'),
        sql<boolean>`exists(select 1 from takeaway_state where rest_id = ${rest.id})`.as('takeaway'),
        // 支线扩充 B（问题记录 515）
        sql<number | null>`(select best_floor from tower_state where rest_id = ${rest.id})`.as('bestFloor'),
        sql<number>`(select count(*) from acquire_state where owner_rest_id = ${rest.id})`.as('holdings'),
        sql<number | null>`(select best from signin_streak where rest_id = ${rest.id})`.as('signinBest'),
        sql<
          number[]
        >`coalesce((select array_agg(goods_id) from store_item where rest_id = ${rest.id} and num > 0), '{}')`.as(
          'owned',
        ),
        sql<number[]>`coalesce((select array_agg(source_id) from effect_source where rest_id = ${rest.id}
          and source_type = 'honor' and (expires_at is null or expires_at > ${now})), '{}')`.as('honors'),
        sql<{ lv10: number; lv30: number }>`(select json_build_object(
          'lv10', count(distinct invitee_account_id) filter (where stage = 'lv10'),
          'lv30', count(distinct invitee_account_id) filter (where stage = 'lv30'))
          from invite_reward where inviter_account_id = ${rest.account_id})`.as('invited'),
        // 支线“经营”（任务清单第二版）
        sql<number>`coalesce((select jsonb_array_length(tables) from restaurant_tables where rest_id = ${rest.id}), 0)`.as(
          'tables',
        ),
        sql<number>`(select count(*) from restaurant_device where rest_id = ${rest.id}
          and (expires_at is null or expires_at > ${now}))`.as('devices'),
        sql<{
          coin: number;
          rounds: number;
        } | null>`(select json_build_object('coin', day_coin, 'rounds', day_rounds) from rest_income_best where rest_id = ${rest.id})`.as(
          'best',
        ),
      ])
      .executeTakeFirstOrThrow();
    const available = (f: string) => featureAvailable(settings, f) && (f !== 'activity' || facts.running);
    const done = new Set<number>(facts.done);
    const counters = facts.counters;
    const counts = normalizeCounts(rest.cookbook_counts);
    const extra = {
      'friends.count': Number(facts.friends),
      'rest.thumbs': counters['thumbs.received'] ?? 0,
      'equip.maxStress': Number(facts.maxStress ?? 0),
      'mc.learned': Number(facts.mcLearned),
      'yard.lands': Number(facts.lands),
      'takeaway.open': facts.takeaway ? 1 : 0,
      'cookbooks.foreignLearned': foreignLearned(counts.street),
      'tower.bestFloor': facts.bestFloor ?? 0,
      'acquire.holdings': Number(facts.holdings),
      'signin.best': facts.signinBest ?? 0,
      'invite.level10': Number(facts.invited.lv10),
      'invite.level30': Number(facts.invited.lv30),
      ...collectionOf(facts.owned, facts.honors, d.config),
      'rest.tables': Number(facts.tables),
      'rest.devices': Number(facts.devices),
      'rest.bestDayCoin': Number(facts.best?.coin ?? 0),
      'rest.bestRounds': Number(facts.best?.rounds ?? 0),
    };
    const progress = (c: QuestCond) =>
      c.kind === 'counter' ? counterOf(c.key, counters) : (stateValue(c.key, rest, counts, extra) ?? 0);
    const ctx: QuestCtx = { level: rest.level, star: rest.star_level, done, progress, available };
    const main = mainView(chapters, quests, ctx);
    const lines = lineViews(questLines, quests, ctx, reachedChapter(main, chapters));
    return { ctx, main, lines, available, tuning: settings.tuning };
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
    const counters = Object.fromEntries(
      (
        await db
          .selectFrom('weekly_counter')
          .select(['key', 'count'])
          .where('rest_id', '=', rest.id)
          .where('week', '=', week)
          .execute()
      ).map((r) => [r.key, r.count]),
    );
    // 和主线一样走 counterOf：键可以用 | 连接（backlog 318）
    const progress = (key: string) => counterOf(key, counters);
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
    return { group, week, list, progress, claimed, allClaimed: list.every((q) => claimed.has(q.id)) };
  }

  const questDto = (q: Quest, progress: number, claimed: boolean, tuning: Tuning): QuestDto => {
    const vars = questVars(q.cond.key, tuning);
    return {
      id: q.id,
      name: q.name,
      href: q.href,
      key: q.cond.key,
      target: q.cond.target,
      progress,
      done: progress >= q.cond.target,
      claimed,
      award: q.award,
      ...(vars ? { vars } : {}),
    };
  };

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
        doneCount: s.main.quests.filter((q) => done.has(q.id) || progress(q.cond) >= q.cond.target).length,
      },
      main: s.main.quests.map((q) => questDto(q, progress(q.cond), done.has(q.id), s.tuning)),
      leftover: s.main.leftover.map((q) => questDto(q, progress(q.cond), false, s.tuning)),
      allMainDone: s.main.allDone,
      lines: s.lines.map((l) => ({
        id: l.line.id,
        name: l.line.name,
        quest: l.quest && questDto(l.quest, progress(l.quest.cond), false, s.tuning),
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
          progress: w.progress(q.key),
          done: w.progress(q.key) >= q.target,
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
      const progress = w.progress(q.key);
      if (progress < q.target) throw requirement('task', { progress, target: q.target });
      award = q.award;
    }
    await grantAward(o, award, { source: 'task.weekly' });
    await o.tx
      .insertInto('weekly_claim')
      .values({ rest_id: o.rest.id, week: w.week, quest_id: id })
      .execute();
  }

  /** 活跃项的等级门槛（问题记录 360）：配置里只写了星级，交易所、事件预测的等级门槛在区服数值里 */
  function actNeedLevel(id: number, settings: ShardSettings): number {
    const t = settings.tuning;
    if (id === ACT_EXCHANGE) return t.exchange.minLevel;
    if (id === ACT_PREDICT) return t.predict.minLevel;
    return 0;
  }

  /** 活跃项的星级门槛：配送外卖按区服数值 takeaway.openStar（配置里写的 2 星只是默认；backlog 第 ⑥ 批） */
  function actNeedStar(a: { id: number; needStar: number }, settings: ShardSettings): number {
    return a.id === ACT_TAKEAWAY ? settings.tuning.takeaway.openStar : a.needStar;
  }

  /**
   * 活跃项要读的店外数据一条查询读完（质量期 ③ 的查询预算）：爱心项链；交易所、事件预测的注册天数、
   * 邮箱门槛和交易所冻结；有没有能领奖的限时活动（backlog 第 ⑥ 批）
   */
  async function actFacts(db: Kysely<DB>, rest: RestaurantRow) {
    const now = d.now();
    const r = await db
      .selectNoFrom([
        sql<boolean>`exists(select 1 from store_item where rest_id = ${rest.id} and goods_id = ${GOODS.loveNecklace} and (expires_at is null or expires_at > ${now}))`.as(
          'necklace',
        ),
        sql<Date>`(select created_at from account where id = ${rest.account_id})`.as('createdAt'),
        sql<boolean>`(select email_verified_at is not null from account where id = ${rest.account_id})`.as(
          'verified',
        ),
        claimableActivity(rest, now).as('activityOpen'),
        sql<boolean>`exists(select 1 from exchange_freeze where rest_id = ${rest.id})`.as('frozen'),
      ])
      .executeTakeFirstOrThrow();
    return {
      necklace: r.necklace,
      createdAt: new Date(r.createdAt),
      verified: r.verified,
      activityOpen: r.activityOpen,
      frozen: r.frozen,
      now,
    };
  }

  /**
   * 活跃项的功能（问题记录 360）：按动作对照表找出算进这一项的所有动作，换成各自的功能；
   * 这些功能在本区服全都关了才算没开放（只要有一种做法还能做就不锁）
   */
  const actFeatures = new Map<string, string[]>();
  for (const [key, name] of Object.entries(d.config.bundle.actionMap.activation)) {
    const f = d.config.featureOfKey(key);
    if (f) actFeatures.set(name, [...(actFeatures.get(name) ?? []), f]);
  }
  const actOff = (name: string, settings: ShardSettings): boolean => {
    const fs = actFeatures.get(name) ?? [];
    return fs.length > 0 && fs.every((x) => !featureAvailable(settings, x));
  };

  async function activationOf(
    db: Kysely<DB>,
    rest: RestaurantRow,
    day: string,
    settings: ShardSettings,
  ): Promise<ActivationDto> {
    const rows = await db
      .selectFrom('daily_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', rest.id)
      .where('day', '=', day)
      .execute();
    const byKey = new Map(rows.map((r) => [r.key, r.count]));
    const acts = d.config.bundle.activationTasks.filter((a) => a.limitTimes > 0);
    const counts = new Map(acts.map((a) => [a.id, byKey.get(`act:${a.id}`) ?? 0]));
    const facts = await actFacts(db, rest);
    const multiplier = facts.necklace ? 2 : 1;
    const needDaysOf = (id: number) =>
      id === ACT_EXCHANGE
        ? settings.tuning.exchange.minAccountDays
        : id === ACT_PREDICT
          ? settings.tuning.predict.minAccountDays
          : 0;
    const blockedOf = (id: number): ActivationBlock => {
      if (id === ACT_EXCHANGE || id === ACT_PREDICT) {
        // 交易所冻结的店两样都做不了；和交易所下单一样先看冻结（事件预测下单也查这个）
        if (facts.frozen) return 'frozen';
        // 门槛和下单时同一个判断；等级另外写在 needLevel 里，这里不管
        const t = id === ACT_EXCHANGE ? settings.tuning.exchange : settings.tuning.predict;
        const why = eligibilityOf(
          { level: Number.MAX_SAFE_INTEGER, createdAt: facts.createdAt, verified: facts.verified },
          t,
          facts.now,
        );
        if (why === 'exchange_age') return 'days';
        if (why === 'exchange_email') return 'email';
      }
      if (id === ACT_ACTIVITY && !facts.activityOpen) return 'noActivity';
      return null;
    };
    return {
      total: activationTotal(acts, counts),
      signedIn: (byKey.get(SIGNIN_KEY) ?? 0) > 0,
      star: rest.star_level,
      level: rest.level,
      items: acts.map((a) => {
        return {
          id: a.id,
          name: a.name,
          points: a.points,
          limit: a.limitTimes,
          count: counts.get(a.id) ?? 0,
          needStar: actNeedStar(a, settings),
          needLevel: actNeedLevel(a.id, settings),
          needDays: needDaysOf(a.id),
          blocked: blockedOf(a.id),
          off: actOff(a.name, settings),
        };
      }),
      rewards: d.config.bundle.activationRewards.map((r) => ({
        points: r.points,
        award: scaled(r.award, rest.level),
        claimed: (byKey.get(claimKey(r.points)) ?? 0) > 0,
        multiplier,
      })),
      kujiTicket: kujiTicketOf(settings),
    };
  }

  /** 活跃奖励另送一番赏券的那一档（一番赏设计 §5.5）；区服关掉一番赏或不送时为 null */
  function kujiTicketOf(settings: ShardSettings): { points: number; num: number } | null {
    const k = settings.tuning.kuji;
    return featureAvailable(settings, 'kuji') && k.activeTickets > 0
      ? { points: k.activeTicketPoints, num: k.activeTickets }
      : null;
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
            ? (!s.main.locked && s.main.quests.some((x) => x.id === taskId)) ||
              s.main.leftover.some((x) => x.id === taskId)
            : s.lines.some((l) => l.quest?.id === taskId);
        if (!visible) throw invalidState('not_visible', { taskId });
        if (s.ctx.done.has(taskId)) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        if (o.rest.star_level < q.needStar)
          throw requirement('star', { need: q.needStar, have: o.rest.star_level });
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
      return activationOf(d.db, rest, gameDay(d.now()), await d.shards.settings(rest.shard_id));
    },

    claimActivation(ctx: RestCtx, points: number) {
      return runOp(d, ctx, { feature: 'task', source: 'activation' }, async (o) => {
        const reward = o.config.bundle.activationRewards.find((r) => r.points === points);
        if (!reward) throw invalidState('no_reward', { points });
        const day = gameDay(o.now);
        const a = await activationOf(o.tx, o.rest, day, o.settings);
        if (a.total < points) throw requirement('activation', { need: points, have: a.total });
        if ((await incrementDaily(o.tx, o.rest.id, claimKey(points), 1, day)) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        const multiplier = (await hasValidHonor(o, GOODS.loveNecklace)) ? 2 : 1;
        await grantAward(o, scaled(reward.award, o.rest.level), { multiplier });
        // 支线“签到和活跃”（问题记录 515）：领 100 点这一档的天数
        if (points === 100) await emitAction(o, 'activation.100');
        // 一番赏（一番赏设计 §5.5）：领 activeTicketPoints 这一档额外送券（默认 120 档，2026-10-08 从 150 档挪过来）；
        // 区服关掉一番赏不送
        let kujiTickets = 0;
        const gift = kujiTicketOf(o.settings);
        if (gift && points === gift.points) {
          kujiTickets = await grantGoodsOp(o, GOODS.kujiTicket, gift.num, { source: 'activation' });
          // 送券写个人日志（backlog 一番赏）：领活跃奖励本身不写，券是额外的，要查得到来源
          if (kujiTickets > 0) restLog(o, 'kuji.activation', { points, num: kujiTickets });
        }
        return { points, kujiTickets };
      });
    },

    signIn(ctx: RestCtx) {
      return runOp(d, ctx, { feature: 'task', source: 'signin' }, async (o) => {
        const day = gameDay(o.now);
        if ((await incrementDaily(o.tx, o.rest.id, SIGNIN_KEY, 1, day)) > 1)
          throw new AppError(ErrorCode.ALREADY_DONE, 400);
        await recordStreak(o.tx, o.rest.id, day);
        await grantGoodsOp(o, GOODS.signInGift, 1);
        await emitAction(o, 'signin');
        return { signedIn: true };
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;

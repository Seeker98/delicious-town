import type { Kysely } from 'kysely';
import { GOODS, type Award, type Task } from '@dt/config';
import { ErrorCode, gameDay, type ActivationDto, type TaskDto, type TasksDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { invalidState, requirement } from '../../core/errors';
import { runOp, setRest, type Op } from '../../core/op';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { incrementDaily } from '../counter/dailyCounter';
import { normalizeCounts } from '../settlement/globals';
import { grantGoodsOp, hasValidHonor } from '../store/goods';
import { activationTotal, effectiveMainStep, stateValue, visibleSide } from './rules';

const SIGNIN_KEY = 'signin';
const claimKey = (points: number) => `act.claim:${points}`;

export function createTaskService(d: GameDeps) {
  const mains = d.config.bundle.tasks.filter((t) => t.main).sort((a, b) => a.step - b.step);

  async function snapshot(db: Kysely<DB>, rest: RestaurantRow) {
    const settings = await d.shards.settings(rest.shard_id);
    const available = (f: string) => featureAvailable(settings, f);
    const done = new Set(
      (await db.selectFrom('task_done').select('task_id').where('rest_id', '=', rest.id).execute()).map(
        (r) => r.task_id,
      ),
    );
    const counters = new Map(
      (
        await db.selectFrom('event_counter').select(['key', 'count']).where('rest_id', '=', rest.id).execute()
      ).map((r) => [r.key, r.count]),
    );
    const counts = normalizeCounts(rest.cookbook_counts);
    const progressOf = (t: Task) =>
      t.cond.kind === 'counter'
        ? (counters.get(t.cond.key) ?? 0)
        : (stateValue(t.cond.key, rest, counts) ?? 0);
    const mainStep = effectiveMainStep(rest.main_task_step, mains, available);
    const main = mains.find((t) => t.step === mainStep) ?? null;
    const side = visibleSide(d.config.bundle.tasks, mainStep, done, available);
    return { mainStep, main, side, progressOf };
  }

  const dto = (t: Task, progress: number): TaskDto => ({
    id: t.id,
    main: t.main,
    step: t.step,
    name: t.name,
    href: t.href,
    kind: t.cond.kind,
    key: t.cond.key,
    target: t.cond.target,
    progress,
    done: progress >= t.cond.target,
    award: t.award,
  });

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
    async tasks(ctx: RestCtx): Promise<TasksDto> {
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const s = await snapshot(d.db, rest);
      return {
        mainStep: s.mainStep,
        main: s.main ? dto(s.main, s.progressOf(s.main)) : null,
        side: s.side.map((t) => dto(t, s.progressOf(t))),
      };
    },

    claimTask(ctx: RestCtx, taskId: number) {
      return runOp(d, ctx, { feature: 'task', source: 'task' }, async (o: Op) => {
        const s = await snapshot(o.tx, o.rest);
        const t = s.main?.id === taskId ? s.main : s.side.find((x) => x.id === taskId);
        if (!t) throw invalidState('not_visible', { taskId });
        const progress = s.progressOf(t);
        if (progress < t.cond.target) throw requirement('task', { progress, target: t.cond.target });
        await grantAward(o, t.award, { source: t.main ? 'task.main' : 'task.side' });
        if (t.main) setRest(o, 'main_task_step', t.step + 1);
        else
          await o.tx
            .insertInto('task_done')
            .values({ rest_id: o.rest.id, task_id: t.id, done_at: o.now })
            .execute();
        return { taskId: t.id };
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
        return { points };
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

import { GOODS } from '@dt/config';
import { ErrorCode, type LessonDto, type LessonLearnDto, type LessonsDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runOp, setRest, type Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { applyForget, gradeOf, padLevels, setGrade } from '../cookbook/rules';
import { normalizeCounts } from '../settlement/globals';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { subRemnant } from './remnant';
import {
  forgetCount,
  forgetMcChance,
  learnRate,
  pickSome,
  stealRate,
  studentStar,
  teacherStar,
} from './rules';

const badInput = (reason: string) => new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 偷学失败：遗忘普通食谱，4 级起可能遗忘一道更低级的特色菜（正在售卖的除外） */
async function forget(o: Op, level: number): Promise<LessonLearnDto['forgot']> {
  const t = o.tuning.mysterious;
  const cb = await o.tx
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  const { slotOf, idAt } = o.config.cookbookIndex;
  const levels = padLevels(new Uint8Array(cb.levels), o.config.cookbookIndex.slots);
  const learned: number[] = [];
  // 按存储位遍历，换回食谱 id（重新编号 PR 3）；空位（删掉的菜）跳过
  for (let s = 0; s < levels.length; s++) {
    const id = idAt[s] ?? -1;
    if (levels[s]! > 0 && id >= 0) learned.push(id);
  }
  const picks = pickSome(learned, forgetCount(level, t), o.rng);
  if (picks.length > 0) {
    let counts = normalizeCounts(o.rest.cookbook_counts);
    for (const id of picks) {
      counts = applyForget(counts, o.config.requireCookbook(id).streetId, gradeOf(levels, slotOf, id));
      setGrade(levels, slotOf, id, 0);
    }
    await o.tx
      .updateTable('restaurant_cookbooks')
      .set({ levels: Buffer.from(levels) })
      .where('rest_id', '=', o.rest.id)
      .execute();
    setRest(o, 'cookbook_counts', counts);
  }
  let mcId: number | null = null;
  if (o.rng.chance(forgetMcChance(level, t))) {
    const current =
      o.rest.mc_cook_id === null
        ? null
        : ((
            await o.tx
              .selectFrom('mc_cook')
              .select('mc_id')
              .where('id', '=', o.rest.mc_cook_id)
              .executeTakeFirst()
          )?.mc_id ?? null);
    const cands = (
      await o.tx
        .selectFrom('rest_mc')
        .select('mc_id')
        .where('rest_id', '=', o.rest.id)
        .orderBy('mc_id')
        .execute()
    )
      .map((r) => r.mc_id)
      .filter((id) => id !== current && (o.config.mysterious.get(id)?.level ?? Infinity) < level);
    if (cands.length > 0) {
      mcId = cands[o.rng.int(cands.length)]!;
      await o.tx.deleteFrom('rest_mc').where('rest_id', '=', o.rest.id).where('mc_id', '=', mcId).execute();
    }
  }
  restLog(o, 'mc.forget', { cookbooks: picks, mcId });
  return { cookbooks: picks, mcId };
}

export function createLessonOps(d: GameDeps) {
  return {
    async lessons(ctx: RestCtx): Promise<LessonsDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const now = d.now();
      const rows = await d.db
        .selectFrom('mc_lesson as l')
        .innerJoin('restaurant as r', 'r.id', 'l.teacher_rest_id')
        .select([
          'l.id',
          'l.teacher_rest_id',
          'r.name',
          'l.mc_id',
          'l.level',
          'l.max_num',
          'l.learned',
          'l.stolen',
          'l.ends_at',
        ])
        .where('l.shard_id', '=', ctx.shardId)
        .where('l.closed_at', 'is', null)
        .where('l.ends_at', '>', now)
        .orderBy('l.ends_at')
        .limit(200)
        .execute();
      const tried = new Set(
        rows.length === 0
          ? []
          : (
              await d.db
                .selectFrom('mc_lesson_student')
                .select('lesson_id')
                .where('rest_id', '=', ctx.restaurantId)
                .where(
                  'lesson_id',
                  'in',
                  rows.map((r) => r.id),
                )
                .execute()
            ).map((r) => r.lesson_id),
      );
      const items: LessonDto[] = rows.map((r) => ({
        id: r.id,
        teacherId: r.teacher_rest_id,
        teacherName: r.name,
        mcId: r.mc_id,
        level: r.level,
        maxNum: r.max_num,
        learned: r.learned,
        stolen: r.stolen,
        endsAt: r.ends_at.toISOString(),
        tried: tried.has(r.id),
      }));
      const certIds = [...d.config.teacherCerts.keys()];
      const held = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num', 'expires_at'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('goods_id', 'in', [...certIds, GOODS.hundredMaster])
        .execute();
      const have = (id: number) => {
        const r = held.find((x) => x.goods_id === id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      return {
        items,
        mine: items.find((x) => x.teacherId === ctx.restaurantId) ?? null,
        certs: certIds.map((goodsId) => {
          const c = d.config.teacherCerts.get(goodsId)!;
          return { goodsId, num: have(goodsId), ...c };
        }),
        canForceClose: have(GOODS.hundredMaster) > 0,
        forceCloseCoinPerLevel: s.tuning.mysterious.forceCloseCoinPerLevel,
        forgetPerLevel: s.tuning.mysterious.forgetPerLevel,
      };
    },

    openLesson(ctx: RestCtx, b: { mcId: number; certId: number }) {
      return runOp(d, ctx, { feature: 'mysterious', source: 'lesson.open' }, async (o) => {
        const mc = o.config.mysterious.get(b.mcId);
        if (!mc) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'mc', id: b.mcId });
        const cert = o.config.teacherCerts.get(b.certId);
        if (!cert) throw badInput('not_teacher_cert');
        if (!cert.levels.includes(mc.level)) throw badInput('cert_level');
        // 计划裁定 4：学生要锁老师的店做双店检查，老师也必须验证邮箱
        const acc = await o.tx
          .selectFrom('account')
          .select('email_verified_at')
          .where('id', '=', o.rest.account_id)
          .executeTakeFirstOrThrow();
        if (o.tuning.friend.requireVerifiedEmail && acc.email_verified_at === null)
          throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
        const learned = await o.tx
          .selectFrom('rest_mc')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (!learned) throw invalidState('mc_not_learned');
        const need = teacherStar(mc.level);
        if (o.rest.star_level < need) throw requirement('star', { need, have: o.rest.star_level });
        // 过期没关闭的课补写 closed_at（设计文档 §4.6）
        await o.tx
          .updateTable('mc_lesson')
          .set({ closed_at: o.now })
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .where('ends_at', '<=', o.now)
          .execute();
        const open = await o.tx
          .selectFrom('mc_lesson')
          .select('id')
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .executeTakeFirst();
        if (open) throw limitReached('lesson_open');
        await subRemnant(o, mc.id, 1);
        await consumeGoods(o, b.certId, 1);
        spendStrength(o, cert.needStrength);
        const l = await o.tx
          .insertInto('mc_lesson')
          .values({
            shard_id: o.shardId,
            teacher_rest_id: o.rest.id,
            mc_id: mc.id,
            level: mc.level,
            max_num: cert.maxNum,
            ends_at: new Date(o.now.getTime() + cert.lessonHour * 3600_000),
            created_at: o.now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await emitAction(o, 'lesson.start');
        return { id: l.id };
      });
    },

    async learnLesson(ctx: RestCtx, id: number, b: { type: 1 | 2 }) {
      const pre = await d.db
        .selectFrom('mc_lesson')
        .select(['teacher_rest_id', 'shard_id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pre || pre.shard_id !== ctx.shardId) throw invalidState('lesson_over');
      if (pre.teacher_rest_id === ctx.restaurantId) throw invalidState('own_lesson');
      return runPairOp(
        d,
        ctx,
        pre.teacher_rest_id,
        { feature: 'mysterious', source: 'lesson.learn', friend: 'none' },
        async (p): Promise<LessonLearnDto> => {
          const o = p.me;
          const t = o.tuning.mysterious;
          const l = await o.tx
            .selectFrom('mc_lesson')
            .selectAll()
            .where('id', '=', id)
            .forUpdate()
            .executeTakeFirst();
          if (!l || l.closed_at !== null || l.ends_at <= o.now) throw invalidState('lesson_over');
          const tried = await o.tx
            .selectFrom('mc_lesson_student')
            .select('lesson_id')
            .where('lesson_id', '=', id)
            .where('rest_id', '=', o.rest.id)
            .executeTakeFirst();
          if (tried) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'lesson' });
          const mine = await o.tx
            .selectFrom('rest_mc')
            .select('mc_id')
            .where('rest_id', '=', o.rest.id)
            .execute();
          if (mine.some((m) => m.mc_id === l.mc_id)) throw invalidState('mc_learned');
          if (l.learned + l.stolen >= l.max_num) throw limitReached('lesson_full');
          if (b.type === 2 && l.stolen > 1) throw invalidState('steal_full');
          if (normalizeCounts(o.rest.cookbook_counts).learned < l.level * 10)
            throw requirement('cookbooks', { need: l.level * 10 });
          if (l.level >= 4 && mine.length < l.level) throw requirement('mc_count', { need: l.level });
          const needStar = studentStar(l.level);
          if (o.rest.star_level < needStar)
            throw requirement('star', { need: needStar, have: o.rest.star_level });
          const mc = o.config.requireMc(l.mc_id);
          const agg = await opAgg(o);
          const { rate: luck } = await opLuck(o);
          const thinker = (agg.thinker ?? 0) > 0;
          let success: boolean;
          let forgot: LessonLearnDto['forgot'] = { cookbooks: [], mcId: null };
          if (b.type === 1) {
            spendStrength(o, t.learnStrength);
            spendCoin(o, Math.floor(mc.coin * t.tuitionTimes));
            await consumeGoods(o, GOODS.fragmentBase + mc.level, t.learnFragments);
            gainCoin(p.them, Math.floor(mc.coin * t.teacherShare), { event: false });
            await grantGoodsOp(p.them, GOODS.fragmentBase + mc.level, t.teacherFragments, { event: false });
            success =
              o.rng.chance(learnRate(thinker, luck, t)) || ((agg.magicLamp ?? 0) > 0 && o.rng.chance(0.5));
          } else {
            spendStrength(o, t.stealStrength);
            success = o.rng.chance(stealRate(l.level, thinker, luck, t));
            if (!success) forgot = await forget(o, l.level);
          }
          await o.tx
            .insertInto('mc_lesson_student')
            .values({ lesson_id: id, rest_id: o.rest.id, type: b.type, success, created_at: o.now })
            .execute();
          if (success) {
            await o.tx
              .insertInto('rest_mc')
              .values({
                rest_id: o.rest.id,
                mc_id: l.mc_id,
                way: 1 + b.type,
                master_rest_id: l.teacher_rest_id,
                learned_at: o.now,
              })
              .execute();
            await o.tx
              .updateTable('mc_lesson')
              .set(b.type === 1 ? { learned: l.learned + 1 } : { stolen: l.stolen + 1 })
              .where('id', '=', id)
              .execute();
            restLog(o, 'mc.learn', { mcId: l.mc_id, via: b.type === 1 ? 'lesson' : 'steal' });
            await emitAction(o, 'lesson.learn');
          }
          feedLog(p, 'lesson.taught', { mcId: l.mc_id, type: b.type, success });
          return { success, forgot };
        },
      );
    },

    closeLesson(ctx: RestCtx) {
      return runOp(d, ctx, { feature: 'mysterious', source: 'lesson.close' }, async (o) => {
        const l = await o.tx
          .selectFrom('mc_lesson')
          .selectAll()
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .where('ends_at', '>', o.now)
          .forUpdate()
          .executeTakeFirst();
        if (!l) throw invalidState('no_lesson');
        if (!(await hasValidHonor(o, GOODS.hundredMaster)))
          throw requirement('statue', { goodsId: GOODS.hundredMaster });
        if (l.learned + l.stolen < l.max_num) throw invalidState('lesson_not_full');
        spendCoin(o, l.level * o.tuning.mysterious.forceCloseCoinPerLevel);
        await o.tx.updateTable('mc_lesson').set({ closed_at: o.now }).where('id', '=', l.id).execute();
        return { id: l.id };
      });
    },
  };
}

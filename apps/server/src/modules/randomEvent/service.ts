import {
  eventTexts,
  GOODS,
  type I18nEntry,
  type RandomEventDef,
  type RandomOutcome,
  type RandomQuizDef,
  type RandomReward,
} from '@dt/config';
import {
  DAY_MS,
  ErrorCode,
  gameDay,
  type Locale,
  type RandomEventCurrentDto,
  type RandomEventDto,
  type RandomQuestionDto,
  type RandomResultDto,
  type RandomRewardDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { featureAvailable } from '../../core/features';
import { invalidateAgg } from '../../core/luck';
import { restLog, runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, gainExp, spendCoin } from '../../core/resources';
import { opNeedPick } from '../../core/scarcity';
import type { Insertable, Selectable } from 'kysely';
import type { RandomEventTable } from '../../db/schema';
import { AppError } from '../../http/errors';
import { awardFoodsPool } from '../award/random';
import { addFoodsMany } from '../cupboard/foods';
import { upsertEffectSource } from '../effects/service';
import { grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';
import {
  eventCandidates,
  foodLevelOf,
  pickDistinct,
  pickEvent,
  pickOutcome,
  quizCandidates,
  shuffledOrder,
  slotOf,
  whenCtx,
  type PastRow,
} from './rules';

/** 加成来源类型；没有对错的问答用 1000 + 题号，免得和事件编号撞 */
export const EFFECT_SOURCE = 'randomEvent';
export const QUIZ_SOURCE_BASE = 1000;

type Row = Selectable<RandomEventTable>;

/** 一道题的出题记录：显示顺序 → 原下标；现出的品级题记品级 */
interface QuizSlot {
  id: number;
  order: number[];
  grades?: number[];
  picked: number | null;
  correct: boolean | null;
}
interface Payload {
  qs: QuizSlot[];
}
/** 实际给了什么：option / index 是选择事件的结果，score 是问答夜答对几道 */
interface Outcome {
  option?: string;
  index?: number;
  score?: number;
  effects: Record<string, number> | null;
  until: string | null;
  reward: RandomRewardDto | null;
}

type Result = Pick<RandomOutcome, 'effects' | 'hours' | 'reward'>;

/** 挂加成、发奖励（设计稿 §5） */
async function apply(o: Op, sourceId: number, r: Result, source: string): Promise<Omit<Outcome, 'option'>> {
  let until: Date | null = null;
  if (r.effects && r.hours) {
    until = new Date(o.now.getTime() + r.hours * 3600_000);
    await upsertEffectSource(o.tx, o.rest.id, {
      sourceType: EFFECT_SOURCE,
      sourceId,
      effects: r.effects as Record<string, number>,
      expiresAt: until,
    });
    invalidateAgg(o);
  }
  const reward = r.reward ? await grant(o, r.reward, source) : null;
  return {
    effects: (r.effects as Record<string, number>) ?? null,
    until: until?.toISOString() ?? null,
    reward,
  };
}

async function grant(o: Op, r: RandomReward, source: string): Promise<RandomRewardDto> {
  const level = o.rest.level;
  const coin = (r.coinPerLevel ?? 0) * level;
  const exp = (r.expPerLevel ?? 0) * level;
  if (coin > 0) gainCoin(o, coin, { source });
  if (exp > 0) gainExp(o, exp, { source });
  if (r.tickets) await grantGoodsOp(o, GOODS.mysteryTicket, r.tickets, { source });
  const foods = new Map<number, number>();
  if (r.foods) {
    const lv = r.foods.level ?? foodLevelOf(level, o.tuning.randomEvents);
    const pool = awardFoodsPool(o.config.bundle.foods, lv);
    const levelOf = (f: number) => o.config.foods.get(f)?.level ?? 99;
    const needPick = await opNeedPick(o);
    for (let i = 0; i < r.foods.num && pool.length > 0; i++) {
      const id = needPick(
        (f) => levelOf(f) <= lv,
        () => pool[o.rng.int(pool.length)]!,
      );
      foods.set(id, (foods.get(id) ?? 0) + 1);
    }
    await addFoodsMany(o, foods, { source });
  }
  return { coin, exp, tickets: r.tickets ?? 0, foods: [...foods].map(([id, num]) => ({ id, num })) };
}

/** 保留期内这家店出现过的（不重复、连续剧前置用） */
async function loadPast(o: Op): Promise<PastRow[]> {
  const since = new Date(o.now.getTime() - o.tuning.randomEvents.retainDays * DAY_MS);
  const rows = await o.tx
    .selectFrom('random_event')
    .select(['kind', 'ref_id', 'choice', 'created_at', 'payload'])
    .where('rest_id', '=', o.rest.id)
    .where('created_at', '>=', since)
    .execute();
  return rows.map((r) => ({
    kind: r.kind,
    refId: r.ref_id,
    choice: r.choice,
    day: gameDay(r.created_at),
    quizIds: ((r.payload as Payload | null)?.qs ?? []).filter((q) => q.picked !== null).map((q) => q.id),
  }));
}

/** 出一道题：打乱选项；品级题从普通到品级上限里抽四个 */
function setQuiz(o: Op, q: RandomQuizDef): QuizSlot {
  if (q.dynamic === 'grade') {
    const max = o.tuning.rest.cookbookMaxGrade;
    const grades = pickDistinct(
      Array.from({ length: max }, (_, i) => i + 1),
      Math.min(4, max),
      o.rng,
    );
    return { id: q.id, order: grades.map((_, i) => i), grades, picked: null, correct: null };
  }
  return { id: q.id, order: shuffledOrder(q.choices.length, o.rng), picked: null, correct: null };
}

/** 这一时段抽一件（设计稿 §3.1）；什么都出不了时返回 null，这一时段就空着 */
async function roll(o: Op, world: WorldService, slot: { key: string }): Promise<Row | null> {
  const t = o.tuning.randomEvents;
  const past = await loadPast(o);
  const today = gameDay(o.now);
  const snap = await world.ensure(o.shardId, o.now, o.tx);
  const c = whenCtx(o.now, snap.weather.id, o.rest.level);
  const knowledge = quizCandidates(o.config.randomQuiz.values(), past, today, t, 'knowledge');
  const events = eventCandidates(o.config.randomEvents.values(), past, c, today, t, {
    quizNight: knowledge.length >= 3,
  });
  const quiz = quizCandidates(o.config.randomQuiz.values(), past, today, t, 'any');
  const wantQuiz = o.rng.chance(t.quizShare);
  const expires = new Date(o.now.getTime() + t.pendingHours * 3600_000);
  const base = { rest_id: o.rest.id, slot: slot.key, created_at: o.now, expires_at: expires };

  if ((wantQuiz && quiz.length > 0) || events.length === 0) {
    if (quiz.length === 0) return null;
    const q = quiz[o.rng.int(quiz.length)]!;
    const payload: Payload = { qs: [setQuiz(o, q)] };
    return insert(o, {
      ...base,
      kind: 'quiz',
      ref_id: q.id,
      status: 'pending',
      payload: JSON.stringify(payload),
    });
  }
  const e = pickEvent(events, o.rng);
  if (e.kind === 'quizNight') {
    const payload: Payload = { qs: pickDistinct(knowledge, 3, o.rng).map((q) => setQuiz(o, q)) };
    return insert(o, {
      ...base,
      kind: 'quizNight',
      ref_id: e.id,
      status: 'pending',
      payload: JSON.stringify(payload),
    });
  }
  if (e.kind === 'choice') return insert(o, { ...base, kind: 'choice', ref_id: e.id, status: 'pending' });
  // 通知：抽中即生效，等玩家点“知道了”
  const res = await apply(o, e.id, e.outcome!, `randomEvent.${e.id}`);
  const outcome: Outcome = { index: 0, ...res };
  restLog(o, 'randomEvent', { kind: 'notice', id: e.id });
  await emitAction(o, 'randomEvent.done');
  return insert(o, {
    ...base,
    kind: 'notice',
    ref_id: e.id,
    status: 'done',
    outcome: JSON.stringify(outcome),
    resolved_at: o.now,
  });
}

async function insert(o: Op, v: Insertable<RandomEventTable>): Promise<Row> {
  return await o.tx.insertInto('random_event').values(v).returningAll().executeTakeFirstOrThrow();
}

/** 按答对几道发问答夜的奖 */
async function settleQuizNight(o: Op, e: RandomEventDef, p: Payload): Promise<Outcome> {
  const score = p.qs.filter((q) => q.correct).length;
  const res = await apply(o, e.id, e.scores![score]!, `randomEvent.${e.id}`);
  restLog(o, 'randomEvent', { kind: 'quizNight', id: e.id, score });
  await emitAction(o, 'randomEvent.done');
  return { score, ...res };
}

/** 超时没回答的作废；问答夜答过的按答对几道算（设计稿 §7） */
async function expireDue(o: Op): Promise<void> {
  const due = await o.tx
    .selectFrom('random_event')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('status', '=', 'pending')
    .where('expires_at', '<=', o.now)
    .execute();
  for (const r of due) {
    const e = r.kind === 'quizNight' ? o.config.randomEvents.get(r.ref_id) : undefined;
    const p = r.payload as Payload | null;
    if (e && p && p.qs.some((q) => q.picked !== null)) {
      const outcome = await settleQuizNight(o, e, p);
      await o.tx
        .updateTable('random_event')
        .set({ status: 'done', outcome: JSON.stringify(outcome), resolved_at: o.now, seen: false })
        .where('id', '=', r.id)
        .execute();
    } else {
      await o.tx.updateTable('random_event').set({ status: 'expired' }).where('id', '=', r.id).execute();
    }
  }
}

function questionDto(o: Op, s: QuizSlot, tr: I18nEntry | undefined): RandomQuestionDto {
  const q = o.config.randomQuiz.get(s.id)!;
  const src = tr?.lines && tr.lines.length === q.choices.length ? tr.lines : q.choices;
  const answered = s.picked !== null;
  let answer: number | null = null;
  if (answered && q.type !== 'opinion') {
    answer = s.grades ? s.grades.indexOf(Math.max(...s.grades)) : s.order.indexOf(q.answer!);
  }
  return {
    id: q.id,
    type: q.type,
    q: tr?.name ?? q.q,
    choices: s.grades ? s.grades.map(String) : s.order.map((i) => src[i]!),
    grades: s.grades ?? null,
    picked: s.picked,
    answer,
    correct: s.correct,
    explain: answered ? (tr?.note ?? q.explain ?? null) : null,
  };
}

function toDto(o: Op, r: Row, lang: Locale): RandomEventDto | null {
  const tr = lang === 'zh-CN' ? undefined : o.config.bundle.i18n[lang];
  const out = r.outcome as Outcome | null;
  const p = r.payload as Payload | null;
  const result = (text: string | null): RandomResultDto | null =>
    out ? { text, effects: out.effects, until: out.until, reward: out.reward } : null;
  const base = {
    id: r.id,
    kind: r.kind,
    refId: r.ref_id,
    status: r.status === 'pending' ? ('pending' as const) : ('done' as const),
    expiresAt: r.expires_at.toISOString(),
    chosen: r.choice && r.kind === 'choice' ? r.choice : null,
  };
  // 配置里删掉了的题：这一行给不出来（current 会把它收掉）
  if (p?.qs.some((s) => !o.config.randomQuiz.has(s.id))) return null;
  const questions = p ? p.qs.map((s) => questionDto(o, s, tr?.randomQuiz[String(s.id)])) : null;
  if (r.kind === 'quiz') {
    if (!o.config.randomQuiz.has(r.ref_id)) return null;
    return { ...base, title: null, body: null, options: null, questions, result: result(null) };
  }
  const e = o.config.randomEvents.get(r.ref_id);
  if (!e) return null;
  const tx = eventTexts(e, tr?.randomEvents[String(e.id)]);
  let text: string | null = null;
  if (out && e.kind === 'notice') text = tx.outcome;
  if (out && e.kind === 'choice') {
    const i = e.options!.findIndex((x) => x.key === out.option);
    text = tx.options[i]?.outcomes[out.index ?? 0] ?? null;
  }
  if (out && e.kind === 'quizNight') text = tx.scores[out.score ?? 0] ?? null;
  return {
    ...base,
    title: tx.title,
    body: tx.body,
    options:
      e.kind === 'choice'
        ? e.options!.map((x, i) => ({
            key: x.key,
            label: tx.options[i]!.label,
            cost: x.cost ? x.cost.coinPerLevel * o.rest.level : null,
          }))
        : null,
    questions: e.kind === 'quizNight' ? questions : null,
    result: result(text),
  };
}

async function loadRow(o: Op, id: string): Promise<Row> {
  const r = await o.tx
    .selectFrom('random_event')
    .selectAll()
    .where('id', '=', id)
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirst();
  if (!r) throw invalidState('random_event_gone');
  return r;
}

/** 回答前的检查：还挂着、没超时 */
async function pendingRow(o: Op, id: string, kinds: Row['kind'][]): Promise<Row> {
  const r = await loadRow(o, id);
  if (!kinds.includes(r.kind)) throw invalidState('random_event_gone');
  if (r.status !== 'pending') throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'random_event' });
  // 报错时整个操作回滚，作废留给下一次 current 的 expireDue
  if (r.expires_at <= o.now) throw invalidState('random_event_expired');
  return r;
}

export function createRandomEventService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'randomEvents', source }, fn);

  return {
    /**
     * 现在要给玩家看的（设计稿 §9）：先作废超时的；有挂着的或没看过结果的就给它；
     * 这一时段还没抽过就抽一次。区服关了功能时返回空，不报错
     */
    async current(ctx: RestCtx, lang: Locale): Promise<OpResult<RandomEventCurrentDto>> {
      if (!featureAvailable(await d.shards.settings(ctx.shardId), 'randomEvents'))
        return { data: { event: null }, events: [] };
      return op(ctx, 'randomEvent.current', async (o) => {
        await expireDue(o);
        for (;;) {
          const open = await o.tx
            .selectFrom('random_event')
            .selectAll()
            .where('rest_id', '=', o.rest.id)
            .where((eb) =>
              eb.or([
                eb('status', '=', 'pending'),
                eb.and([eb('status', '=', 'done'), eb('seen', '=', false)]),
              ]),
            )
            .orderBy('created_at', 'desc')
            .limit(1)
            .executeTakeFirst();
          if (!open) break;
          const dto = toDto(o, open, lang);
          if (dto) return { event: dto };
          // 事件或题已从配置里删掉：挂着的作废、没看过的记成看过，接着往下（不然这家店再也不出事件）
          await o.tx
            .updateTable('random_event')
            .set(open.status === 'pending' ? { status: 'expired' } : { seen: true })
            .where('id', '=', open.id)
            .execute();
        }
        const slot = slotOf(o.now, o.tuning.randomEvents.slotHours);
        const done = await o.tx
          .selectFrom('random_event')
          .select('id')
          .where('rest_id', '=', o.rest.id)
          .where('slot', '=', slot.key)
          .executeTakeFirst();
        if (done) return { event: null };
        const row = await roll(o, world, slot);
        return { event: row ? toDto(o, row, lang) : null };
      });
    },

    /** 选择事件：扣花费、按权重抽结果、挂加成、发奖励 */
    choose(ctx: RestCtx, id: string, option: string, lang: Locale) {
      return op(ctx, 'randomEvent.choose', async (o) => {
        const r = await pendingRow(o, id, ['choice']);
        const e = o.config.randomEvents.get(r.ref_id);
        const x = e?.options?.find((y) => y.key === option);
        if (!e || !x) throw invalidState('random_event_gone');
        const source = `randomEvent.${e.id}`;
        if (x.cost) spendCoin(o, x.cost.coinPerLevel * o.rest.level, { source });
        const index = pickOutcome(x.outcomes, o.rng);
        const outcome: Outcome = { option, index, ...(await apply(o, e.id, x.outcomes[index]!, source)) };
        const row = await o.tx
          .updateTable('random_event')
          .set({
            status: 'done',
            choice: option,
            outcome: JSON.stringify(outcome),
            resolved_at: o.now,
            seen: true,
          })
          .where('id', '=', r.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        restLog(o, 'randomEvent', { kind: 'choice', id: e.id, option });
        await emitAction(o, 'randomEvent.done');
        return toDto(o, row, lang)!;
      });
    },

    /** 问答、问答夜答一道（设计稿 §7）：只能答一次；问答夜三道都答完按答对几道发奖 */
    answer(ctx: RestCtx, id: string, b: { index: number; q?: number }, lang: Locale) {
      return op(ctx, 'randomEvent.answer', async (o) => {
        const t = o.tuning.randomEvents;
        const r = await pendingRow(o, id, ['quiz', 'quizNight']);
        const p = r.payload as Payload;
        const qi = r.kind === 'quiz' ? 0 : (b.q ?? p.qs.findIndex((s) => s.picked === null));
        const s = p.qs[qi];
        if (!s) throw invalidState('random_event_gone');
        if (s.picked !== null) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'random_event' });
        const q = o.config.randomQuiz.get(s.id);
        if (!q) throw invalidState('random_event_gone');
        const n = s.grades ? s.grades.length : s.order.length;
        if (b.index >= n) throw invalidState('random_event_gone');
        s.picked = b.index;
        const orig = s.grades ? b.index : s.order[b.index]!;
        if (q.type !== 'opinion')
          s.correct = s.grades ? s.grades[b.index] === Math.max(...s.grades) : orig === q.answer;
        let outcome: Outcome | null = null;
        if (r.kind === 'quiz') {
          const sourceId = QUIZ_SOURCE_BASE + q.id;
          const source = `randomQuiz.${q.id}`;
          const res: Result =
            q.type === 'opinion'
              ? q.results![orig]!
              : s.correct
                ? { reward: q.reward ?? (t.correctTickets > 0 ? { tickets: t.correctTickets } : undefined) }
                : { reward: t.wrongExpPerLevel > 0 ? { expPerLevel: t.wrongExpPerLevel } : undefined };
          outcome = await apply(o, sourceId, res, source);
          restLog(o, 'randomEvent', { kind: 'quiz', id: q.id, correct: s.correct });
          await emitAction(o, 'randomEvent.done');
        } else if (p.qs.every((x) => x.picked !== null)) {
          outcome = await settleQuizNight(o, o.config.randomEvents.get(r.ref_id)!, p);
        }
        const row = await o.tx
          .updateTable('random_event')
          .set({
            payload: JSON.stringify(p),
            ...(outcome
              ? { status: 'done' as const, outcome: JSON.stringify(outcome), resolved_at: o.now, seen: true }
              : {}),
          })
          .where('id', '=', r.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toDto(o, row, lang)!;
      });
    },

    /** 通知、超时结算的问答夜：看过了 */
    seen(ctx: RestCtx, id: string) {
      return op(ctx, 'randomEvent.seen', async (o) => {
        await loadRow(o, id);
        await o.tx.updateTable('random_event').set({ seen: true }).where('id', '=', id).execute();
        return { ok: true };
      });
    },
  };
}

export type RandomEventService = ReturnType<typeof createRandomEventService>;

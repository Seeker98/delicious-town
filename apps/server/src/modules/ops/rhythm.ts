import { ErrorCode, type RhythmDto, type RhythmRow } from '@dt/shared';
import { AppError } from '../../http/errors';
import type { Game } from '../../game';
import { createWhitelist } from '../../security/antibot/whitelist';
import { createChallengeList } from '../../security/antibot/challenge';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';

const HOUR = 3_600_000;
const DAYS = 7;
/** 写操作少于这么多的不列 */
const MIN_POSTS = 20;
/** 北京时间 = UTC + 8 */
const CST = 8 * HOUR;

/**
 * 打分（0~100，后台页面原样写出这条规则）：
 * 40 × min(每天有操作的小时数 ÷ 20, 1) + 20 × min(最长连续小时数 ÷ 12, 1)
 * + 20 × (1 − 间隔变异系数，样本不足按 0 分) + 10 × 没看页面的比例 + 10 × 很久没真人操作的比例
 */
export function rhythmScore(
  r: Pick<RhythmRow, 'activeHoursPerDay' | 'longestStreakHours' | 'gapCv' | 'noViewShare' | 'idleShare'>,
): number {
  const s =
    40 * Math.min(r.activeHoursPerDay / 20, 1) +
    20 * Math.min(r.longestStreakHours / 12, 1) +
    20 * (r.gapCv === null ? 0 : Math.max(0, 1 - r.gapCv)) +
    10 * r.noViewShare +
    10 * r.idleShare;
  return Math.round(s * 10) / 10;
}

/** 操作节奏和防脚本白名单（2026-10-25） */
export function createRhythmAdmin(game: Game) {
  const db = game.app.db;
  const whitelist = (game.app.antibotWhitelist ??= createWhitelist(db));
  const challengeList = (game.app.antibotChallenges ??= createChallengeList(db));

  async function list(shardId: number): Promise<RhythmDto> {
    const since = new Date(game.deps.now().getTime() - DAYS * 86_400_000);
    const topN = (await game.shards.settings(shardId)).tuning.ops.suspicious.topN;
    const hours = await db
      .selectFrom('play_rhythm as p')
      .innerJoin('restaurant as r', 'r.account_id', 'p.account_id')
      .innerJoin('account as a', 'a.id', 'p.account_id')
      .select([
        'p.account_id',
        'p.hour',
        'p.posts',
        'p.gap_n',
        'p.gap_sum',
        'p.gap_sq',
        'p.bursts',
        'p.no_view',
        'p.idle_long',
        'p.verdicts',
        'p.uas',
        'p.devices',
        'a.username',
        'r.id as rest_id',
        'r.name as rest_name',
      ])
      .where('r.shard_id', '=', shardId)
      .where('r.npc', '=', false)
      .where('p.hour', '>=', since)
      .orderBy('p.account_id')
      .orderBy('p.hour')
      .execute();
    const wl = await db
      .selectFrom('antibot_whitelist as w')
      .innerJoin('account as a', 'a.id', 'w.account_id')
      .select(['w.account_id', 'a.username', 'w.note', 'w.created_at'])
      .orderBy('w.created_at', 'desc')
      .execute();
    const white = new Set(wl.map((w) => w.account_id));

    const byAccount = new Map<number, typeof hours>();
    for (const h of hours) {
      const l = byAccount.get(h.account_id) ?? [];
      l.push(h);
      byAccount.set(h.account_id, l);
    }
    const rows: RhythmRow[] = [];
    for (const [accountId, hs] of byAccount) {
      const active = hs.filter((h) => h.posts > 0);
      const posts = active.reduce((s, h) => s + h.posts, 0);
      if (posts < MIN_POSTS) continue;
      const days = new Set(active.map((h) => new Date(h.hour.getTime() + CST).toISOString().slice(0, 10)))
        .size;
      let streak = 0;
      let longest = 0;
      let prev = -Infinity;
      for (const h of active) {
        const t = h.hour.getTime();
        streak = t - prev === HOUR ? streak + 1 : 1;
        longest = Math.max(longest, streak);
        prev = t;
      }
      const night = active
        .filter((h) => {
          const hh = new Date(h.hour.getTime() + CST).getUTCHours();
          return hh >= 2 && hh < 7;
        })
        .reduce((s, h) => s + h.posts, 0);
      const gn = hs.reduce((s, h) => s + h.gap_n, 0);
      const gs = hs.reduce((s, h) => s + Number(h.gap_sum), 0);
      const gq = hs.reduce((s, h) => s + h.gap_sq, 0);
      const mean = gn > 0 ? gs / gn : 0;
      const gapCv = gn < 30 || mean === 0 ? null : Math.sqrt(Math.max(0, gq / gn - mean * mean)) / mean;
      const verdicts: Record<string, number> = {};
      for (const h of hs)
        for (const [k, v] of Object.entries(h.verdicts ?? {})) verdicts[k] = (verdicts[k] ?? 0) + Number(v);
      const first = hs[0]!;
      const base = {
        activeHoursPerDay: days === 0 ? 0 : Math.round((active.length / days) * 10) / 10,
        longestStreakHours: longest,
        gapCv: gapCv === null ? null : Math.round(gapCv * 1000) / 1000,
        noViewShare: hs.reduce((s, h) => s + h.no_view, 0) / posts,
        idleShare: hs.reduce((s, h) => s + h.idle_long, 0) / posts,
      };
      rows.push({
        accountId,
        username: first.username,
        restId: first.rest_id,
        restName: first.rest_name,
        whitelisted: white.has(accountId),
        score: rhythmScore(base),
        days,
        ...base,
        nightPosts: night,
        posts,
        bursts: hs.reduce((s, h) => s + h.bursts, 0),
        verdicts,
        uas: Math.max(...hs.map((h) => h.uas)),
        devices: Math.max(...hs.map((h) => h.devices)),
        lastDevice: null,
        lastIp: null,
        challengeUntil: null,
      });
    }
    rows.sort((x, y) => Number(x.whitelisted) - Number(y.whitelisted) || y.score - x.score);
    // 白名单的不受行数限制、全部接在后面：拦截模式下它们决定谁不被拦，后台要一直看得到
    const top = [...rows.filter((r) => !r.whitelisted).slice(0, topN), ...rows.filter((r) => r.whitelisted)];
    // 去封禁时预填：最近一次登录用的设备号、IP
    if (top.length > 0) {
      const traces = await db
        .selectFrom('login_trace')
        .select(['account_id', 'ip', 'device_id', 'last_seen'])
        .where(
          'account_id',
          'in',
          top.map((r) => r.accountId),
        )
        .orderBy('last_seen', 'desc')
        .execute();
      for (const r of top) {
        const t = traces.find((x) => x.account_id === r.accountId);
        r.lastIp = t?.ip ?? null;
        r.lastDevice = traces.find((x) => x.account_id === r.accountId && x.device_id)?.device_id ?? null;
      }
    }
    // 人机验证名单（PR②）：只列没到期的
    const ch = await db
      .selectFrom('antibot_challenge as c')
      .innerJoin('account as a', 'a.id', 'c.account_id')
      .select(['c.account_id', 'a.username', 'c.note', 'c.until'])
      .where('c.until', '>', game.deps.now())
      .orderBy('c.until')
      .execute();
    const untilOf = new Map(ch.map((c) => [c.account_id, c.until.toISOString()]));
    for (const r of top) r.challengeUntil = untilOf.get(r.accountId) ?? null;
    return {
      rows: top,
      challenges: ch.map((c) => ({
        accountId: c.account_id,
        username: c.username,
        note: c.note,
        until: c.until.toISOString(),
      })),
      whitelist: wl.map((w) => ({
        accountId: w.account_id,
        username: w.username,
        note: w.note,
        at: w.created_at.toISOString(),
      })),
    };
  }

  async function add(actor: AdminActor, b: { accountId: number; note: string }) {
    const exists = await db
      .selectFrom('account')
      .select('id')
      .where('id', '=', b.accountId)
      .executeTakeFirst();
    if (!exists) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'account', id: b.accountId });
    await db
      .insertInto('antibot_whitelist')
      .values({ account_id: b.accountId, note: b.note, actor_account_id: actor.accountId })
      .onConflict((oc) =>
        oc.column('account_id').doUpdateSet({ note: b.note, actor_account_id: actor.accountId }),
      )
      .execute();
    await writeAudit(db, {
      actor,
      action: 'antibot.whitelist',
      target: `account:${b.accountId}`,
      detail: { note: b.note },
    });
    await whitelist.refresh();
    return { ok: true as const };
  }

  async function remove(actor: AdminActor, b: { accountId: number }) {
    const gone = await db
      .deleteFrom('antibot_whitelist')
      .where('account_id', '=', b.accountId)
      .executeTakeFirst();
    if (Number(gone.numDeletedRows) > 0)
      await writeAudit(db, { actor, action: 'antibot.unwhitelist', target: `account:${b.accountId}` });
    await whitelist.refresh();
    return { ok: true as const };
  }

  /** 对可疑号打开人机验证（PR②）：从现在起 days 天 */
  async function challenge(actor: AdminActor, b: { accountId: number; days: 1 | 3 | 7; note: string }) {
    const exists = await db
      .selectFrom('account')
      .select('id')
      .where('id', '=', b.accountId)
      .executeTakeFirst();
    if (!exists) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'account', id: b.accountId });
    const until = new Date(game.deps.now().getTime() + b.days * 86_400_000);
    await db
      .insertInto('antibot_challenge')
      .values({ account_id: b.accountId, until, note: b.note, actor_account_id: actor.accountId })
      .onConflict((oc) =>
        oc.column('account_id').doUpdateSet({ until, note: b.note, actor_account_id: actor.accountId }),
      )
      .execute();
    await writeAudit(db, {
      actor,
      action: 'antibot.challenge',
      target: `account:${b.accountId}`,
      detail: { days: b.days, until: until.toISOString(), note: b.note },
    });
    await challengeList.refresh();
    return { ok: true as const };
  }

  async function unchallenge(actor: AdminActor, b: { accountId: number }) {
    const gone = await db
      .deleteFrom('antibot_challenge')
      .where('account_id', '=', b.accountId)
      .executeTakeFirst();
    if (Number(gone.numDeletedRows) > 0)
      await writeAudit(db, { actor, action: 'antibot.unchallenge', target: `account:${b.accountId}` });
    await challengeList.refresh();
    return { ok: true as const };
  }

  return { list, add, remove, challenge, unchallenge };
}

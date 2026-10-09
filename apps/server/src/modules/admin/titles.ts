import { sql } from 'kysely';
import {
  ErrorCode,
  type AdminTitleDto,
  type CreateTitleInput,
  type TitleSource,
  type UpdateTitleInput,
} from '@dt/shared';
import type { Game } from '../../game';
import { invalidState } from '../../core/errors';
import { AppError } from '../../http/errors';
import { customKey } from '../icons/defs';
import { iconLive } from '../friend/looks';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

/** 一番赏配置里用到的称号：各档的 icon、按月的 icons（不管嵌在哪一层都算） */
function kujiIcons(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => kujiIcons(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (k === 'icon' && typeof x === 'string') out.add(x);
      else if (k === 'icons' && x && typeof x === 'object' && !Array.isArray(x)) {
        for (const y of Object.values(x)) if (typeof y === 'string') out.add(y);
      } else kujiIcons(x, out);
    }
  return out;
}

/** 后台称号页（定制称号设计 二）：定制称号的增删改查；配置称号只读列出 */
export function createAdminTitles(game: Game) {
  const { db, config } = game.app;

  /** 每个称号现在拥有（没过期）的店数 */
  async function owners(keys?: string[]): Promise<Map<string, number>> {
    let q = db
      .selectFrom('rest_icon')
      .select(['icon_key', (eb) => eb.fn.countAll<string>().as('n')])
      .where(iconLive(game.deps.now()))
      .groupBy('icon_key');
    if (keys) {
      if (keys.length === 0) return new Map();
      q = q.where('icon_key', 'in', keys);
    }
    return new Map((await q.execute()).map((r) => [r.icon_key, Number(r.n)]));
  }

  function customQuery() {
    return db
      .selectFrom('custom_icon as c')
      .leftJoin('account as a', 'a.id', 'c.created_by')
      .select(['c.id', 'c.title', 'c.descr', 'c.note', 'c.retired', 'c.created_at', 'a.username']);
  }
  type CustomRow = Awaited<ReturnType<ReturnType<typeof customQuery>['executeTakeFirstOrThrow']>>;
  const customDto = (r: CustomRow, n: Map<string, number>): AdminTitleDto => ({
    key: customKey(r.id),
    id: r.id,
    title: r.title,
    desc: r.descr,
    note: r.note,
    source: 'custom',
    retired: r.retired,
    owners: n.get(customKey(r.id)) ?? 0,
    createdBy: r.username,
    createdAt: r.created_at.toISOString(),
  });

  async function one(id: number): Promise<AdminTitleDto> {
    const r = await customQuery().where('c.id', '=', id).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'title', id });
    return customDto(r, await owners([customKey(id)]));
  }

  function sourceOf(key: string, shop: boolean, kuji: Set<string>, fund: Set<string>): TitleSource {
    if (shop) return 'shop';
    if (kuji.has(key)) return 'kuji';
    if (fund.has(key)) return 'fund';
    return 'general';
  }

  return {
    /** 定制的按 id 倒序在前，配置的在后；q 匹配名字或备注（配置的只有名字） */
    async list(q?: string): Promise<AdminTitleDto[]> {
      let cq = customQuery().orderBy('c.id', 'desc');
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        cq = cq.where((eb) => eb.or([eb('c.title', 'ilike', like), eb('c.note', 'ilike', like)]));
      }
      const [rows, n] = await Promise.all([cq.execute(), owners()]);
      const kuji = kujiIcons([config.tuning.kuji, config.bundle.kujiDeluxeMonths]);
      const fund = new Set(config.bundle.fundMedals.map((m) => m.icon));
      const conf = config.bundle.looks.icons
        .filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()))
        .map((i): AdminTitleDto => ({
          key: i.key,
          id: null,
          title: i.title,
          desc: i.desc || null,
          note: null,
          source: sourceOf(i.key, i.shop !== undefined, kuji, fund),
          retired: false,
          owners: n.get(i.key) ?? 0,
          createdBy: null,
          createdAt: null,
        }));
      return [...rows.map((r) => customDto(r, n)), ...conf];
    },

    async create(actor: AdminActor, b: CreateTitleInput): Promise<AdminTitleDto> {
      const id = await db.transaction().execute(async (tx) => {
        const r = await tx
          .insertInto('custom_icon')
          .values({
            title: b.title,
            descr: b.desc ?? null,
            note: b.note ?? null,
            created_by: actor.accountId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, { actor, action: 'title.create', target: `title:${r.id}`, detail: { ...b } });
        return r.id;
      });
      return one(id);
    },

    /** 改名字、说明、备注、停用：已经拥有的人看到的也跟着变 */
    async update(actor: AdminActor, id: number, b: UpdateTitleInput): Promise<AdminTitleDto> {
      const before = await one(id);
      const set = {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.desc !== undefined ? { descr: b.desc } : {}),
        ...(b.note !== undefined ? { note: b.note } : {}),
        ...(b.retired !== undefined ? { retired: b.retired } : {}),
      };
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('custom_icon')
          .set({ ...set, updated_at: sql<Date>`now()` })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, {
          actor,
          action: 'title.update',
          target: `title:${id}`,
          detail: {
            before: { title: before.title, desc: before.desc, note: before.note, retired: before.retired },
            after: set,
          },
        });
      });
      return one(id);
    },

    /** 只有没人拥有（含已过期的）、没有邮件和兑换码引用时才能删；否则只能停用 */
    async remove(actor: AdminActor, id: number): Promise<void> {
      const t = await one(id);
      const ref = JSON.stringify([{ key: t.key }]);
      const used = await db
        .selectNoFrom((eb) => [
          eb.exists(eb.selectFrom('rest_icon').select('id').where('icon_key', '=', t.key)).as('owned'),
          eb
            .exists(
              eb
                .selectFrom('mail')
                .select('id')
                .where(sql<boolean>`items -> 'icons' @> ${ref}::jsonb`),
            )
            .as('mailed'),
          eb
            .exists(
              eb
                .selectFrom('redeem_code')
                .select('id')
                .where(sql<boolean>`items -> 'icons' @> ${ref}::jsonb`),
            )
            .as('coded'),
        ])
        .executeTakeFirstOrThrow();
      if (used.owned || used.mailed || used.coded) throw invalidState('title_in_use');
      await db.transaction().execute(async (tx) => {
        await tx.deleteFrom('custom_icon').where('id', '=', id).execute();
        await writeAudit(tx, {
          actor,
          action: 'title.delete',
          target: `title:${id}`,
          detail: { title: t.title },
        });
      });
    },
  };
}

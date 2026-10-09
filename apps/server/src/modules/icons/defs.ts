import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { CUSTOM_ICON_KEY } from '@dt/shared';
import type { DB } from '../../db/schema';

/** 一个称号的定义：配置称号和后台新建的定制称号（问题记录 539）用同一种 */
export interface IconDef {
  key: string;
  title: string;
  desc: string | undefined;
  custom: boolean;
  retired: boolean;
}

export const customKey = (id: number) => `c${id}`;
export function customId(key: string): number | null {
  const m = CUSTOM_ICON_KEY.exec(key);
  return m ? Number(m[1]) : null;
}

/** 配置的直接取；c<id> 一次查 custom_icon。查不到的 key 不在结果里 */
export async function iconDefs(
  db: Kysely<DB>,
  config: GameConfig,
  keys: Iterable<string>,
): Promise<Map<string, IconDef>> {
  const out = new Map<string, IconDef>();
  const conf = new Map(config.bundle.looks.icons.map((i) => [i.key, i]));
  const ids = new Set<number>();
  for (const key of keys) {
    const c = conf.get(key);
    if (c) out.set(key, { key, title: c.title, desc: c.desc, custom: false, retired: false });
    else {
      const id = customId(key);
      if (id !== null && id <= 2_147_483_647) ids.add(id);
    }
  }
  if (ids.size > 0) {
    const rows = await db
      .selectFrom('custom_icon')
      .select(['id', 'title', 'descr', 'retired'])
      .where('id', 'in', [...ids])
      .execute();
    for (const r of rows)
      out.set(customKey(r.id), {
        key: customKey(r.id),
        title: r.title,
        desc: r.descr ?? undefined,
        custom: true,
        retired: r.retired,
      });
  }
  return out;
}

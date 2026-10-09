import type { TableResultDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { GRADE_NAMES } from './labels';

export interface DishNames {
  cookbookName(id: number): string;
  mcName(id: number): string;
}

/** 点菜的顾客：挑剔顾客、蟹老板 */
const ORDERING: ReadonlySet<number> = new Set([2, 8]);
const special = (last: TableResultDto) => (last.mcNum && last.mcId !== undefined ? last.mcId : null);

/**
 * 餐桌格子里的一行（问题记录 559）：挑剔顾客和蟹老板写点的菜，普通顾客和章鱼哥写吃的特色菜；
 * 都没有（没点到菜、没吃特色菜、旧记录没有特色菜编号）时为 null
 */
export function tableDish(last: TableResultDto | undefined, names: DishNames): string | null {
  if (!last) return null;
  if (ORDERING.has(last.type) && last.cookbookId !== undefined) return names.cookbookName(last.cookbookId);
  const mc = special(last);
  return mc === null ? null : names.mcName(mc);
}

/** 点开一桌的详情：点了什么、要几品、你的几品、满不满意；吃了特色菜再写一行 */
export function tableOrderLines(last: TableResultDto | undefined, names: DishNames): string[] {
  if (!last) return [];
  const m = activeMessages().rest.floor;
  const grade = (g: number | undefined) => GRADE_NAMES[g ?? 0] ?? '';
  const out: string[] = [];
  if (ORDERING.has(last.type) && last.req !== undefined) {
    out.push(
      last.cookbookId !== undefined
        ? m.ordered(names.cookbookName(last.cookbookId), grade(last.req), grade(last.grade), !!last.satisfied)
        : m.orderedNone(grade(last.req)),
    );
  }
  const mc = special(last);
  if (mc !== null) out.push(m.ateSpecial(names.mcName(mc), last.mcNum!));
  return out;
}

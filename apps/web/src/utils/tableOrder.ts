import type { TableResultDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { GRADE_NAMES } from './labels';

export interface DishNames {
  cookbookName(id: number): string;
  mcName(id: number): string;
}

/**
 * 点菜的顾客：挑剔顾客、蟹老板。收益模型改版 2026-11-19 以后挑剔顾客不再走人，-2 不再产生
 * （改版前最后一轮留在桌上的 -2 不写点的菜，格子里只写顾客类型）
 */
const ORDERING: ReadonlySet<number> = new Set([2, 8]);
/**
 * 品级够的菜有几道就一定满意（区服数值 settlement.fame.satisfyCount 的默认值）。
 * 网页拿不到区服数值，餐桌页的提示按默认值写；区服改了这个数时提示会不准
 */
export const SATISFY_COUNT = 30;
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

/** 点了菜但不满意的挑剔顾客、蟹老板：详情下面提示够品级的菜越多越容易满意（收益模型改版 2026-11-19） */
export function unsatisfiedOrder(last: TableResultDto | undefined): boolean {
  return !!last && ORDERING.has(last.type) && last.cookbookId !== undefined && last.satisfied === false;
}

import type { StoreItemDto } from '@dt/shared';
import { activeLocale } from '../i18n';

/** 仓库分组顺序（问题记录 186）：消耗品、道具、礼包、设施、勋章；其他类型排最后 */
export const STORE_TYPES: readonly number[] = [0, 1, 2, 3, 9];
const rank = (t: number) => {
  const i = STORE_TYPES.indexOf(t);
  return i < 0 ? STORE_TYPES.length : i;
};
/** 名字排序按当前语言（简中、繁中按拼音） */
const collatorOf = (l: string) => new Intl.Collator(l === 'zh-CN' || l === 'zh-TW' ? 'zh-Hans-CN' : l);

/** 先按类型；组内有剩余时间的先排、短的在前；再按名字拼音；最后按道具 id */
export function sortStoreItems(
  items: StoreItemDto[],
  typeOf: (goodsId: number) => number,
  nameOf: (goodsId: number) => string,
): StoreItemDto[] {
  const collator = collatorOf(activeLocale());
  const exp = (x: StoreItemDto) => (x.expiresAt ? new Date(x.expiresAt).getTime() : Infinity);
  const byExp = (a: StoreItemDto, b: StoreItemDto) => {
    const [ea, eb] = [exp(a), exp(b)];
    return ea === eb ? 0 : ea - eb;
  };
  return [...items].sort(
    (a, b) =>
      rank(typeOf(a.goodsId)) - rank(typeOf(b.goodsId)) ||
      byExp(a, b) ||
      collator.compare(nameOf(a.goodsId), nameOf(b.goodsId)) ||
      a.goodsId - b.goodsId,
  );
}

/** 排好序再按类型切组（同一种未知类型归在一组） */
export function groupStoreItems(
  items: StoreItemDto[],
  typeOf: (goodsId: number) => number,
  nameOf: (goodsId: number) => string,
): Array<{ type: number; items: StoreItemDto[] }> {
  const out: Array<{ type: number; items: StoreItemDto[] }> = [];
  for (const it of sortStoreItems(items, typeOf, nameOf)) {
    const t = typeOf(it.goodsId);
    const last = out[out.length - 1];
    if (last && last.type === t) last.items.push(it);
    else out.push({ type: t, items: [it] });
  }
  return out;
}

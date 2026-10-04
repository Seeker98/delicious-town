import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useWikiStore } from '../../stores/wiki';

/** 游戏资料的五类（问题记录 142） */
export const WIKI_KINDS = ['goods', 'foods', 'cookbooks', 'equips', 'streets'] as const;
export type WikiKind = (typeof WIKI_KINDS)[number];
export const isWikiKind = (k: unknown): k is WikiKind => WIKI_KINDS.includes(k as WikiKind);

/** 厨具的详情就是道具详情 */
export const wikiPath = (kind: WikiKind, id: number) => `/wiki/${kind === 'equips' ? 'goods' : kind}/${id}`;

/** 各类数据：经 wiki store 按语言缓存 */
export function useWikiData() {
  const wiki = useWikiStore();
  return {
    index: () => wiki.get('index', endpoints.openIndex),
    goods: () => wiki.get('goods', endpoints.openGoods),
    foods: () => wiki.get('foods', endpoints.openFoods),
    cookbooks: () => wiki.get('cookbooks', endpoints.openCookbooks),
    equips: () => wiki.get('equips', endpoints.openEquips),
    streets: () => wiki.get('streets', endpoints.openStreets),
    goodsDetail: (id: number) => wiki.get(`goods/${id}`, (l) => endpoints.openGoodsDetail(l, id)),
    food: (id: number) => wiki.get(`foods/${id}`, (l) => endpoints.openFood(l, id)),
    cookbook: (id: number) => wiki.get(`cookbooks/${id}`, (l) => endpoints.openCookbook(l, id)),
  };
}

/** 读不到（404）还是读失败：页面上写不同的话 */
export const isNotFound = (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND';

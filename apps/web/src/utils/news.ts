import type { NewsDto } from '@dt/shared';
import { activeLocale, activeMessages } from '../i18n';
import { predictTitle } from './serverText';

export interface NewsNames {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName(id: number): string;
  weatherName(id: number): string;
  streetName(id: number): string;
  /** 星愿名按目录取（第 8c 批）；测试里可以不传 */
  data?(kind: 'bless', id: number): { name: string } | undefined;
}

/** 有文案的新闻类型（测试用来对照 NEWS_TYPES） */
export const newsRendered = (): string[] => Object.keys(activeMessages().news.render);

/** 新闻文案：店名用当前名字；店已不存在时用新闻里记下的名字，都没有时写"某家餐厅" */
export function newsText(n: NewsDto, x: NewsNames): string {
  const m = activeMessages().news;
  const r = Object.hasOwn(m.render, n.type) ? m.render[n.type as keyof typeof m.render] : undefined;
  if (!r) return m.unknown;
  const name = typeof n.params.name === 'string' ? n.params.name : '';
  const who = n.restName ?? (name || m.someone);
  // 自动预测题的题目按题型和参数、当前语言渲染（问题记录 272）
  const p = n.params;
  const params =
    n.type === 'town.bless' && typeof p.blessId === 'number' && x.data?.('bless', p.blessId)
      ? { ...p, blessName: x.data('bless', p.blessId)!.name }
      : n.type === 'predict.result' && typeof p.kind === 'string'
        ? {
            ...p,
            title: predictTitle({
              kind: p.kind,
              title: String(p.title ?? ''),
              params: (p.eventParams ?? {}) as Record<string, unknown>,
            }),
          }
        : p;
  return r(who, params, x);
}

export function newsTime(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

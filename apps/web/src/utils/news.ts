import type { NewsDto } from '@dt/shared';
import { gameDateTime } from './format';
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
  /** 称号名按目录取（240-2 称号商店，跟着语言）；测试里可以不传 */
  icon?(key: string): { title: string } | undefined;
}

/** 有文案的新闻类型（测试用来对照 NEWS_TYPES） */
export const newsRendered = (): string[] => Object.keys(activeMessages().news.render);

/** 新闻文案：店名用当前名字；店已不存在时用新闻里记下的名字，都没有时写"某家餐厅" */
export function newsText(n: NewsDto, x: NewsNames): string {
  return render(n, x, null);
}

/** 新闻的一段：店名带店编号，页面上做成链接（问题记录 567） */
export interface NewsPart {
  text: string;
  restId?: number;
}

/** 渲染时先用占位字符代替能点的店名，再按占位拆开（文案各语言自己拼，店名在句子里的位置不固定） */
const WHO = String.fromCharCode(0xe000);
const OTHER = String.fromCharCode(0xe001);

/**
 * 新闻拆成几段，店名那段带店编号（问题记录 567）：主语的店（店还在时），收购新闻里被收购的店。
 * 拼回去和 newsText 一字不差
 */
export function newsParts(raw0: NewsDto, x: NewsNames): NewsPart[] {
  // 店名、喇叭内容里本身带占位字符时先去掉，免得被当成链接（backlog 1010）
  const strip = (v: string) => v.split(WHO).join('').split(OTHER).join('');
  const n: NewsDto = {
    ...raw0,
    restName: raw0.restName === null ? null : strip(raw0.restName),
    params: Object.fromEntries(
      Object.entries(raw0.params).map(([k, v]) => [k, typeof v === 'string' ? strip(v) : v]),
    ),
  };
  const links = new Map<string, { text: string; restId: number }>();
  if (n.restId !== null && n.restName) links.set(WHO, { text: n.restName, restId: n.restId });
  const p = n.params;
  if (n.type === 'acquire.big' && typeof p.restId === 'number' && typeof p.name === 'string' && p.name)
    links.set(OTHER, { text: p.name, restId: p.restId });
  const raw = render(n, x, links.size > 0 ? { who: links.has(WHO), other: links.has(OTHER) } : null);
  const out: NewsPart[] = [];
  let buf = '';
  for (const ch of raw) {
    const link = links.get(ch);
    if (!link) {
      buf += ch;
      continue;
    }
    if (buf) out.push({ text: buf });
    buf = '';
    out.push(link);
  }
  if (buf) out.push({ text: buf });
  return out;
}

/** mark：哪些店名换成占位字符（newsParts 用） */
function render(n: NewsDto, x: NewsNames, mark: { who: boolean; other: boolean } | null): string {
  const m = activeMessages().news;
  const r = Object.hasOwn(m.render, n.type) ? m.render[n.type as keyof typeof m.render] : undefined;
  if (!r) return m.unknown;
  const name = typeof n.params.name === 'string' ? n.params.name : '';
  const who = mark?.who ? WHO : (n.restName ?? (name || m.someone));
  // 自动预测题的题目按题型和参数、当前语言渲染（问题记录 272）
  const p = n.params;
  const blessKnown = typeof p.blessId === 'number' && x.data?.('bless', p.blessId);
  const zh = activeLocale() === 'zh-CN' || activeLocale() === 'zh-TW';
  const params =
    n.type === 'town.bless' && blessKnown
      ? { ...p, blessName: blessKnown.name }
      : n.type === 'town.bless' && !zh
        ? // 下架去掉的星愿目录里没有译名，记下的是简中名：外文写“一个星愿”（backlog）
          { ...p, blessName: m.blessGone }
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
  return r(who, mark?.other ? { ...params, name: OTHER } : params, x);
}

export function newsTime(iso: string): string {
  return gameDateTime(iso, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

import type { DailyLang, Locale } from '@dt/shared';

/** 小镇日报正文的一小段：普通文字，或者一家店（带链接） */
export type DailySeg = { kind: 'text'; text: string } | { kind: 'rest'; id: number; text: string };

/** 记号（店除外）按玩家语言的名字：k 是 g/f/m/s/w */
export type DailyNames = (k: string, id: number) => string;

const TOKEN_RE = /\{([rgfmsw]):(\d+)\}/g;

function segments(
  text: string,
  rests: Record<string, string | null>,
  names: DailyNames,
  closed: string,
): DailySeg[] {
  const out: DailySeg[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    const id = Number(m[2]);
    if (m[1] === 'r') {
      const name = rests[String(id)];
      out.push(name ? { kind: 'rest', id, text: name } : { kind: 'text', text: closed });
    } else out.push({ kind: 'text', text: names(m[1]!, id) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** 正文按换行分段（AI 有时只用一个换行，backlog），空行去掉；每段拆成文字和店 */
export function dailyParagraphs(
  body: string,
  rests: Record<string, string | null>,
  names: DailyNames,
  closed: string,
): DailySeg[][] {
  return body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => segments(p, rests, names, closed));
}

/** 标题：记号换成纯文字 */
export function dailyPlain(
  text: string,
  rests: Record<string, string | null>,
  names: DailyNames,
  closed: string,
): string {
  return segments(text, rests, names, closed)
    .map((s) => s.text)
    .join('');
}

/** AI 只写简中和英文，繁中由简中转；西语、法语看英文 */
export function dailyLang(locale: Locale): { lang: DailyLang; englishOnly: boolean } {
  if (locale === 'zh-CN' || locale === 'zh-TW' || locale === 'en')
    return { lang: locale, englishOnly: false };
  return { lang: 'en', englishOnly: true };
}

interface CatalogNames {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName(id: number): string;
  streetName(id: number): string;
  weatherName(id: number): string;
}

/** 记号按道具目录换成玩家语言的名字 */
export function catalogNames(c: CatalogNames): DailyNames {
  return (k, id) => {
    switch (k) {
      case 'g':
        return c.goodsName(id);
      case 'f':
        return c.foodName(id);
      case 'm':
        return c.mcName(id);
      case 's':
        return c.streetName(id);
      default:
        return c.weatherName(id);
    }
  };
}

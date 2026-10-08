import * as OpenCC from 'opencc-js';
import { tokensIn, type DailyFacts } from './facts';

/** 一种语言的日报 */
export interface Article {
  title: string;
  body: string;
}

/** 长度上限（设计 §三）：简中按字，英文按字符 */
const LIMITS = {
  'zh-CN': { title: 24, body: 600 },
  en: { title: 90, body: 3000 },
} as const;

/** 解析 AI 回的 JSON；不合格抛错，原因写进 message（记进 town_daily.error） */
export function parseArticle(text: string, lang: 'zh-CN' | 'en', minBody: number): Article {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error(`${lang}: bad json`);
  }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const body = typeof o.body === 'string' ? o.body.trim() : '';
  const lim = LIMITS[lang];
  const len = (s: string) => [...s].length;
  if (len(title) < 1 || len(title) > lim.title) throw new Error(`${lang}: title length ${len(title)}`);
  if (len(body) < minBody || len(body) > lim.body) throw new Error(`${lang}: body length ${len(body)}`);
  return { title, body };
}

const URL_RE = /https?:|www\.|\.(com|net|org|cn|io|xyz|top|me)\b/i;

/** 素材里出现过的记号 */
function allowed(facts: DailyFacts): Set<string> {
  const { names: _names, ...rest } = facts;
  return new Set(tokensIn(JSON.stringify(rest)));
}

/** 记号都要是素材里有的（AI 不能编店）；不能有网址、尖括号 */
export function checkArticle(a: Article, facts: DailyFacts): void {
  const ok = allowed(facts);
  for (const tok of tokensIn(`${a.title}\n${a.body}`))
    if (!ok.has(tok)) throw new Error(`unknown token ${tok}`);
  for (const s of [a.title, a.body]) {
    if (URL_RE.test(s)) throw new Error('contains url');
    if (/[<>]/.test(s)) throw new Error('contains < or >');
  }
}

/** 英文的记号要和简中一模一样（个数、内容） */
export function sameTokens(zh: Article, en: Article): void {
  const a = tokensIn(`${zh.title}\n${zh.body}`).join(',');
  const b = tokensIn(`${en.title}\n${en.body}`).join(',');
  if (a !== b) throw new Error(`en tokens differ: [${a}] vs [${b}]`);
}

const cnToTw = OpenCC.Converter({ from: 'cn', to: 'twp' });

/** 繁中：和界面文字一样用 OpenCC 从简中转，不调用 AI */
export function toTw(a: Article): Article {
  return { title: cnToTw(a.title), body: cnToTw(a.body) };
}

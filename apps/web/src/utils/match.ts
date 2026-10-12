import { HANS, HANT } from './hantFold';

/** 繁体字 → 简体字（只收食材名里用到的字，见 scripts/gen-hant-fold.mjs） */
const TO_HANS = new Map([...HANT].map((c, i) => [c, [...HANS][i]!]));

/**
 * 去掉重音符号、转小写：Crème → creme，Phở → pho；法文窄空格、西文不换行空格当普通空格
 * （法西标点批终审：名字里的“100 %”“« litchi »”改成不换行空格后，输入普通空格要照样搜得到）；
 * 繁体字换成简体字（橱柜改版：繁简都认）
 */
function fold(s: string): string {
  return [
    ...s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[\u00a0\u202f]/g, ' ')
      .toLowerCase(),
  ]
    .map((c) => TO_HANS.get(c) ?? c)
    .join('');
}

/** 搜索框匹配：包含即可，不区分大小写、忽略重音符号（问题记录 316）；空关键字算匹配 */
export function matchText(text: string, q: string): boolean {
  if (!q) return true;
  return fold(text).includes(fold(q));
}

/**
 * 匹配到的字在原文里的起止下标（橱柜搜索把匹配的字标紫色）；没匹配或空关键字是 null。
 * 一个字一个字折叠，记下折叠后每个字来自原文哪里，下标才对得上（重音符号折叠后会变短）
 */
export function matchRange(text: string, q: string): [number, number] | null {
  const fq = fold(q);
  if (!fq) return null;
  let folded = '';
  const from: number[] = [];
  let i = 0;
  for (const c of text) {
    const f = fold(c);
    for (let k = 0; k < f.length; k++) from.push(i);
    folded += f;
    i += c.length;
  }
  from.push(text.length);
  const at = folded.indexOf(fq);
  if (at < 0) return null;
  const end = at + fq.length;
  // 结尾落在某个字中间时取那个字的结尾；后面跟着的单独重音符号也算进去
  let stop = end < from.length - 1 ? from[end]! : text.length;
  while (stop < text.length && /\p{M}/u.test(text[stop]!)) stop++;
  return [from[at]!, stop];
}

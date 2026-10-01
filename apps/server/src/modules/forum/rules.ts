/** 论坛纯规则（设计文档 §2） */

/** 去掉首尾空白和 \r，连续 3 个以上换行压成 2 个（最多保留一个空行） */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
}

/** 按字符计长度（emoji 算 1） */
export function textLength(s: string): number {
  return [...s].length;
}

/** 长度检查：0 < 长度 ≤ max */
export function textOk(s: string, max: number): boolean {
  const n = textLength(s);
  return n > 0 && n <= max;
}

/** ILIKE 关键词：转义 \ % _ 后两边加 %（默认转义符就是 \） */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** 游标：`${活动时间毫秒}:${id}` */
export function encodeCursor(at: Date, id: number): string {
  return `${at.getTime()}:${id}`;
}

export function decodeCursor(s: string): { at: Date; id: number } | null {
  const m = /^(\d{1,15}):(\d{1,10})$/.exec(s);
  if (!m) return null;
  return { at: new Date(Number(m[1])), id: Number(m[2]) };
}

/** 摘要：换行变空格，截到 n 个字符 */
export function excerpt(s: string, n: number): string {
  return [...s.replace(/\s*\n\s*/g, ' ')].slice(0, n).join('');
}

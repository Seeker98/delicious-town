/** 去掉重音符号、转小写：Crème → creme，Phở → pho */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** 搜索框匹配：包含即可，不区分大小写、忽略重音符号（问题记录 316）；空关键字算匹配 */
export function matchText(text: string, q: string): boolean {
  if (!q) return true;
  return fold(text).includes(fold(q));
}

/**
 * 去掉重音符号、转小写：Crème → creme，Phở → pho；法文窄空格、西文不换行空格当普通空格
 * （法西标点批终审：名字里的“100 %”“« litchi »”改成不换行空格后，输入普通空格要照样搜得到）
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase();
}

/** 搜索框匹配：包含即可，不区分大小写、忽略重音符号（问题记录 316）；空关键字算匹配 */
export function matchText(text: string, q: string): boolean {
  if (!q) return true;
  return fold(text).includes(fold(q));
}

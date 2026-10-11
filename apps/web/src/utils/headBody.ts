/**
 * 一句话拆成标题和说明（界面改版 P11：更新记录冒号前面是标题、用宋体加粗；游玩指引每天的事项冒号前面是地点）。
 * 冒号是“: ”（法文前面带窄空格），找不到冒号或标题太长时整条当说明
 */
export function headBody(text: string): { head: string; body: string } {
  const i = text.indexOf(': ');
  if (i <= 0 || i > 60) return { head: '', body: text };
  return { head: text.slice(0, i).replace(/[\s\u202f]+$/, ''), body: text.slice(i + 2) };
}

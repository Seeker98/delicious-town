export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** 食材等级的显示名：7 级是神秘食材、9 级是万能食材（问题记录） */
export function foodLevelLabel(level: number): string {
  if (level === 7) return '神秘';
  if (level === 9) return '万能';
  return `${level} 级`;
}

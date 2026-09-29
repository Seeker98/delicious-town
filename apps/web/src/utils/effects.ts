/** 加成键的显示顺序和名称（规格书 00 §0.6） */
const LABELS: Array<[key: string, label: string, kind: 'rate' | 'value']> = [
  ['atRate', '上座率', 'rate'],
  ['spRate', '挑剔率', 'rate'],
  ['coinRate', '最终银币', 'rate'],
  ['expRate', '最终经验', 'rate'],
  ['oilRate', '耗油', 'rate'],
  ['coinValue', '每桌银币', 'value'],
  ['expValue', '每桌经验', 'value'],
  ['oilValue', '每桌耗油', 'value'],
  ['luckValue', '幸运', 'value'],
];

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function describeEffects(effects: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, label, kind] of LABELS) {
    const v = effects[key];
    if (v === undefined) continue;
    parts.push(kind === 'rate' ? `${label}${signed(Math.round(v * 1000) / 10)}%` : `${label}${signed(v)}`);
  }
  return parts.join(' ');
}

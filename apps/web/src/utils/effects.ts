import { activeMessages, type Messages } from '../i18n';
import { formatPct } from './format';

/** 加成键的显示顺序（规格书 00 §0.6）；名称按语言（问题记录 272） */
const KEYS: Array<[key: keyof Messages['util']['effects'], kind: 'rate' | 'value']> = [
  ['atRate', 'rate'],
  ['spRate', 'rate'],
  ['coinRate', 'rate'],
  ['expRate', 'rate'],
  // 特色菜金牌（厨具收益加成，问题记录 411）
  ['mcGoldRate', 'rate'],
  ['oilRate', 'rate'],
  ['coinValue', 'value'],
  ['expValue', 'value'],
  ['oilValue', 'value'],
  ['luckValue', 'value'],
];

/** 一项加成的文字："挑剔率+10%"、"每桌银币+5" */
function effectText(key: keyof Messages['util']['effects'], kind: 'rate' | 'value', v: number): string {
  const u = activeMessages().util;
  return u.effect(u.effects[key], kind === 'rate' ? formatPct(v, { sign: true }) : signed(v));
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function describeEffects(effects: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, kind] of KEYS) {
    const v = effects[key];
    if (v === undefined) continue;
    parts.push(effectText(key, kind, v));
  }
  return parts.join(' ');
}

/** 越低越好的键（挑剔率、耗油） */
const LOWER_IS_BETTER: ReadonlySet<string> = new Set(['spRate', 'oilRate', 'oilValue']);

/** 每项一个标签：good 表示对玩家有利（问题记录：生效的加成展示凌乱） */
export function effectChips(effects: Record<string, number>): Array<{ text: string; good: boolean }> {
  const out: Array<{ text: string; good: boolean }> = [];
  for (const [key, kind] of KEYS) {
    const v = effects[key];
    if (v === undefined) continue;
    out.push({
      text: effectText(key, kind, v),
      good: LOWER_IS_BETTER.has(key) ? v < 0 : v > 0,
    });
  }
  return out;
}

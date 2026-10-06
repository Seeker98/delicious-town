import { activeMessages, type Messages } from '../i18n';
import { formatPct } from './format';

/**
 * 各处用的名称表（问题记录 272 起按语言）：导出的是代理，每次读取都取当前语言的表，
 * 调用的地方不用改；切换语言时页面会重新挂载
 */
function localized<T extends object>(pick: (m: Messages['labels']) => object): T {
  const cur = () => pick(activeMessages().labels);
  return new Proxy({} as T, {
    get: (_t, k) => {
      const target = cur();
      const v: unknown = Reflect.get(target, k);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    has: (_t, k) => Reflect.has(cur(), k),
    ownKeys: () => Reflect.ownKeys(cur()),
    getOwnPropertyDescriptor: (_t, k) => {
      const d = Reflect.getOwnPropertyDescriptor(cur(), k);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

/** 顾客类型（规格书 01 §1.4） */
export const CUSTOMER_NAMES = localized<Record<string, string>>((l) => l.customer);
export const GRADE_NAMES = localized<readonly string[]>((l) => l.grade);
export const RATE_LABELS = localized<Record<string, { label: string; percent: boolean }>>((l) => l.rate);
export const PART_LABELS = localized<Record<string, string>>((l) => l.part);
export const TASTE_NAMES = localized<readonly string[]>((l) => l.taste);
/** 街道类型（问题记录 378 方案 C） */
export const STREET_FOCUS = localized<Record<string, string>>((l) => l.streetFocus);

/** 带正负号的百分数（按语言写，视觉第三轮） */
export function pct(x: number): string {
  return formatPct(x, { sign: true });
}

/** 厨具部位（下标 = part） */
export const PART_NAMES = localized<readonly string[]>((l) => l.equipPart);

export const ATTR_KEYS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

export const ATTR_NAMES = localized<Record<string, string>>((l) => l.attr);

/** 特色菜的道（规格书 04 §4.1） */
export const ROAD_NAMES = localized<readonly string[]>((l) => l.road);

/** 外卖单品级（下标 = 品级，规格书 14.2） */
export const TAKEAWAY_GRADES = localized<readonly string[]>((l) => l.takeawayGrade);

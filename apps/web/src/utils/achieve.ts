import { achProgressKey, type CatalogAchLineDto, type CatalogTrophyDto } from '@dt/shared';
import { activeMessages } from '../i18n';
import { formatNum, formatPct, gameDateTime } from './format';

/** 十二个分类（和配置 ACH_CATS 同序；hidden 是隐藏成就，legacy 是绝版成就） */
export const ACH_CATS = [
  'rest',
  'daily',
  'cookbook',
  'mc',
  'friend',
  'bar',
  'tower',
  'temple',
  'finance',
  'town',
  'hidden',
  'legacy',
] as const;
export type AchCatKey = (typeof ACH_CATS)[number];
/** 一级标签只有三个（视觉规范 §10.1 分区不超过两层）：十一个分类在“分类”页里用下拉框选 */
export const ACH_TABS = ['overview', 'trophies', 'lines'] as const;
export type AchTab = (typeof ACH_TABS)[number];

type Line = CatalogAchLineDto;
type Tier = Line['tiers'][number];

/** 目录里成就要用到的几样（测试里传假的） */
export interface AchCatalog {
  achLines: Line[];
  achById: ReadonlyMap<string, { line: Line; tier: Tier }>;
  trophyMap: ReadonlyMap<string, CatalogTrophyDto>;
  streets: Array<{ id: number; cookName: string }>;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export const roman = (n: number): string => ROMAN[n - 1] ?? String(n);

/** 隐藏成就还没达成：名字、说明都显示 ??? */
export function isSecret(line: Line, got: ReadonlySet<string>): boolean {
  return line.hidden === true && !line.tiers.some((t) => got.has(t.id));
}

/** 线的名字：菜系线用街道的菜系名 */
export function lineName(line: Line, c: AchCatalog): string {
  if (line.streetId === null) return line.name;
  return c.streets.find((s) => s.id === line.streetId)?.cookName ?? line.name;
}

/** 这一档的显示：配置写了各档名（星级、熟练等级、基金档）用名字，否则写门槛数字 */
export function tierText(line: Line, tier: Tier): string {
  return line.labels?.[tier.tier - 1] ?? formatNum(tier.n);
}

/** 一个成就的名字：线名 + 罗马数字档；只有一档的线只写线名 */
export function achName(id: string, c: AchCatalog): string {
  const x = c.achById.get(id);
  if (!x) return id;
  const name = lineName(x.line, c);
  return x.line.tiers.length === 1 ? name : activeMessages().achieve.tierName(name, roman(x.tier.tier));
}

export function trophyName(key: string, c: AchCatalog): string {
  const t = c.trophyMap.get(key);
  if (!t) return key;
  if (t.streetId === null) return t.name;
  const cook = c.streets.find((s) => s.id === t.streetId)?.cookName ?? '';
  return activeMessages().achieve.cuisineTrophy(cook, t.name);
}

/** 哪条线的哪一档给这个奖杯 */
export function trophySource(key: string, c: AchCatalog): { line: Line; tier: Tier } | undefined {
  for (const line of c.achLines) {
    const tier = line.tiers.find((t) => t.trophy === key);
    if (tier) return { line, tier };
  }
  return undefined;
}

/** 这一档的口径当前值 */
export function tierValue(progress: Record<string, number>, line: Line, tier: Tier): number {
  return (
    progress[achProgressKey(tier.metric, tier.metric.startsWith('state:cuisine') ? line.streetId : null)] ?? 0
  );
}

export interface LineState {
  line: Line;
  /** 达成了几档 */
  got: number;
  /** 下一档（都达成了是 null） */
  next: Tier | null;
  /** 下一档口径的当前值（看别人的成就墙时没有进度，是 null） */
  cur: number | null;
  done: boolean;
}

export function lineState(
  line: Line,
  got: ReadonlySet<string>,
  progress: Record<string, number> | null,
): LineState {
  const n = line.tiers.filter((t) => got.has(t.id)).length;
  const next = line.tiers.find((t) => !got.has(t.id)) ?? null;
  return {
    line,
    got: n,
    next,
    cur: next && progress ? tierValue(progress, line, next) : null,
    done: next === null,
  };
}

/** 一个分类：达成几个、共几个、拿到几点 */
export function catStats(cat: string, c: AchCatalog, got: ReadonlySet<string>) {
  const tiers = c.achLines.filter((l) => l.cat === cat).flatMap((l) => l.tiers);
  const mine = tiers.filter((t) => got.has(t.id));
  return { got: mine.length, total: tiers.length, pts: mine.reduce((a, t) => a + t.pts, 0) };
}

/** 本区达成占比写成百分数（按语言）：不到 1% 写 <1%，保留整数 */
export function rarityText(r: number | undefined): string {
  const x = r ?? 0;
  return x > 0 && x < 0.01 ? `<${formatPct(0.01, { digits: 0 })}` : formatPct(x, { digits: 0 });
}

/** 达成时间：月日时分（和动态一样，游戏时间） */
export function achWhen(iso: string): string {
  return gameDateTime(iso, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

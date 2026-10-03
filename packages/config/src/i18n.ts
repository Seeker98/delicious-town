import * as OpenCC from 'opencc-js';
import type { SourceData } from './source';

/**
 * 游戏数据翻译（问题记录 272）：每类数据能翻的字段。
 * tiers 是字符串数组（套装各档说明，按档位顺序）；装扮的个性图标按 key 对应，其余按 id
 */
export const I18N_FIELDS = {
  goods: ['name', 'desc'],
  foods: ['name'],
  weather: ['name', 'note'],
  streets: ['name', 'desc', 'cookName'],
  devices: ['name'],
  suits: ['name', 'tiers'],
  mysterious: ['name'],
  doors: ['name'],
  avatars: ['name'],
  icons: ['title', 'desc'],
  // 第 8c 批：服务端接口直接给名字的数据，前端按 id 从目录取（任务、活跃项、星愿、厨塔各层、菜园配方、一番赏主题、特色菜熟练度）
  tasks: ['name'],
  // 问题记录 318：主线章节、玩法支线的名字（tasks 一类是主线、支线、每周任务的名字）
  chapters: ['name'],
  questLines: ['name'],
  activation: ['name'],
  bless: ['name'],
  tower: ['name', 'title', 'note'],
  formulas: ['name'],
  kujiThemes: ['name', 'desc'],
  proficiency: ['name'],
  // 第 9 批：菜名（食谱）
  cookbooks: ['name'],
} as const;
export type I18nKind = keyof typeof I18N_FIELDS;
export const I18N_KINDS = Object.keys(I18N_FIELDS) as I18nKind[];
/** 有翻译数据文件的语言；繁中由简中自动转换，简中是原文 */
export const I18N_FILE_LOCALES = ['en', 'fr', 'es'] as const;
export type I18nLocale = 'zh-TW' | (typeof I18N_FILE_LOCALES)[number];

type TextField = 'name' | 'desc' | 'note' | 'cookName' | 'title';
const LIST_FIELDS: ReadonlySet<string> = new Set(['tiers']);

export type I18nEntry = Partial<Record<TextField, string>> & { tiers?: string[] };
export type I18nTable = Record<I18nKind, Record<string, I18nEntry>>;
export type BundleI18n = Record<I18nLocale, I18nTable>;

/** 读取的数据源键：i18n/<语言>/<种类> */
export const I18N_SOURCE_FILES = I18N_FILE_LOCALES.flatMap((l) => I18N_KINDS.map((k) => `i18n/${l}/${k}`));

/** 一条可翻译的数据：id（个性图标是 key）和原文字段 */
export type I18nItem = { id: number | string } & I18nEntry;

const emptyTable = (): I18nTable =>
  Object.fromEntries(I18N_KINDS.map((k) => [k, {}])) as unknown as I18nTable;

/**
 * 校验英法西的翻译数据（id 要存在、字段只能是这一类能翻的、值是字符串或字符串数组），
 * 再用 OpenCC 把简中原文转换成繁中
 */
export function buildI18n(
  data: Record<I18nKind, readonly I18nItem[]>,
  src: SourceData,
  errors: string[],
): BundleI18n {
  const out = { 'zh-TW': emptyTable() } as BundleI18n;
  for (const l of I18N_FILE_LOCALES) {
    out[l] = emptyTable();
    for (const k of I18N_KINDS) {
      const raw = src[`i18n/${l}/${k}`];
      if (raw === undefined) continue;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`i18n ${l} ${k} must be an object`);
        continue;
      }
      const ids = new Set(data[k].map((x) => String(x.id)));
      const fields: readonly string[] = I18N_FIELDS[k];
      for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
        if (!ids.has(id)) {
          errors.push(`i18n ${l} ${k} unknown id ${id}`);
          continue;
        }
        if (entry === null || typeof entry !== 'object') {
          errors.push(`i18n ${l} ${k} ${id} must be an object`);
          continue;
        }
        const clean: I18nEntry = {};
        for (const [f, v] of Object.entries(entry as Record<string, unknown>)) {
          if (!fields.includes(f)) errors.push(`i18n ${l} ${k} ${id} unknown field ${f}`);
          else if (LIST_FIELDS.has(f)) {
            if (Array.isArray(v) && v.every((x) => typeof x === 'string')) clean.tiers = v as string[];
            else errors.push(`i18n ${l} ${k} ${id} ${f} must be an array of strings`);
          } else if (typeof v !== 'string') errors.push(`i18n ${l} ${k} ${id} ${f} must be a string`);
          else clean[f as TextField] = v;
        }
        out[l][k][id] = clean;
      }
    }
  }
  const toTw = OpenCC.Converter({ from: 'cn', to: 'twp' });
  for (const k of I18N_KINDS) {
    for (const item of data[k]) {
      const e: I18nEntry = {};
      for (const f of I18N_FIELDS[k] as readonly string[]) {
        if (f === 'tiers') {
          if (item.tiers) e.tiers = item.tiers.map((x) => toTw(x));
        } else {
          const v = item[f as TextField];
          if (v) e[f as TextField] = toTw(v);
        }
      }
      out['zh-TW'][k][String(item.id)] = e;
    }
  }
  return out;
}

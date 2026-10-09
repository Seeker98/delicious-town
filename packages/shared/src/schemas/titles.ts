import { z } from 'zod';

/** 定制称号（问题记录 539，设计 2026-10-09）：名字、说明、备注的上限，按看上去的字数 */
export const TITLE_MAX = 10;
export const TITLE_DESC_MAX = 30;
export const TITLE_NOTE_MAX = 100;
/** 一份附件里最多几个称号、一次邮件最多发几家店 */
export const MAIL_ICONS_MAX = 5;
export const MAIL_RESTS_MAX = 50;

/** 定制称号的键 c<id>；配置称号的 key 不能长这样（配置构建检查） */
export const CUSTOM_ICON_KEY = /^c([1-9]\d{0,9})$/;
export const iconKey = z.string().regex(/^[a-z0-9_-]{1,32}$/);

const cp = (n: number) => String.fromCodePoint(n);
const range = (a: number, b: number) => `${cp(a)}-${cp(b)}`;
/**
 * 去掉的字符：控制字符（含换行）、零宽空格 U+200B、U+FEFF、方向控制 U+202A~202E、U+2066~2069；
 * emoji 要用的零宽连接符 U+200D、变体选择符 U+FE0F 保留
 */
const STRIP = new RegExp(
  `[${range(0, 0x1f)}${cp(0x7f)}${cp(0x200b)}${cp(0xfeff)}${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}]`,
  'gu',
);
const NEWLINE = /[\r\n]/;

export function cleanTitleText(s: string): string {
  return s.replace(STRIP, '').trim();
}

/**
 * 用到时才建：shared 玩家网页也会加载，老的安卓 WebView 没有 Intl.Segmenter，
 * 模块加载时就建会让整个网页打不开；没有时退回按码位数（只影响后台的字数提示）
 */
let segmenter: Intl.Segmenter | null | undefined;
/** 按字素数：👨‍🍳、国旗都算 1 个 */
export function graphemeLen(s: string): number {
  if (segmenter === undefined)
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter('zh', { granularity: 'grapheme' })
        : null;
  if (!segmenter) return [...s].length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/** 称号文字：有换行报 newline，清理后为空报 empty（可空的变 undefined），超长 too_long；输出清理后的文字 */
export function titleText(max: number): z.ZodType<string, z.ZodTypeDef, unknown>;
export function titleText(
  max: number,
  opts: { optional: true },
): z.ZodType<string | undefined, z.ZodTypeDef, unknown>;
export function titleText(max: number, opts?: { optional?: boolean }): z.ZodTypeAny {
  return z
    .string()
    .optional()
    .superRefine((s, ctx) => {
      if (s === undefined) {
        if (!opts?.optional) ctx.addIssue({ code: 'custom', message: 'empty' });
        return;
      }
      if (NEWLINE.test(s)) ctx.addIssue({ code: 'custom', message: 'newline' });
      const c = cleanTitleText(s);
      if (!c && !opts?.optional) ctx.addIssue({ code: 'custom', message: 'empty' });
      if (graphemeLen(c) > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
    })
    .transform((s) => {
      const c = s === undefined ? '' : cleanTitleText(s);
      return c || (opts?.optional ? undefined : c);
    });
}

/** 有效期：领取后 N 天，或到某个时间；都不填是永久 */
export const iconValidity = {
  days: z.number().int().min(1).max(3650).optional(),
  until: z.string().datetime({ offset: true }).optional(),
};
export const oneValidity = (v: { days?: number; until?: string }) =>
  v.days === undefined || v.until === undefined;

/** 附件里的一个称号：title 是发送时的名字快照，服务端按 key 重新填 */
export const rewardIcon = z
  .object({ key: iconKey, title: z.string().max(40).default(''), ...iconValidity })
  .refine(oneValidity, { message: 'days_or_until' });
export interface RewardIcon {
  key: string;
  title: string;
  days?: number;
  until?: string;
  /** 只出现在领取结果里：until 已过、这次跳过了 */
  expired?: true;
}

export const createTitleBody = z.object({
  title: titleText(TITLE_MAX),
  desc: titleText(TITLE_DESC_MAX, { optional: true }),
  note: titleText(TITLE_NOTE_MAX, { optional: true }),
});
export type CreateTitleInput = z.infer<typeof createTitleBody>;
/** 改的时候：不传是不改，传空串（清理后为空）是清掉（null） */
const clearable = (max: number) =>
  z
    .string()
    .optional()
    .superRefine((s, ctx) => {
      if (s === undefined) return;
      if (NEWLINE.test(s)) ctx.addIssue({ code: 'custom', message: 'newline' });
      if (graphemeLen(cleanTitleText(s)) > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
    })
    .transform((s) => (s === undefined ? undefined : cleanTitleText(s) || null));
export const updateTitleBody = z.object({
  title: titleText(TITLE_MAX).optional(),
  desc: clearable(TITLE_DESC_MAX),
  note: clearable(TITLE_NOTE_MAX),
  retired: z.boolean().optional(),
});
export type UpdateTitleInput = z.infer<typeof updateTitleBody>;
export const titleListQuery = z.object({ q: z.string().trim().max(40).optional() });

export type TitleSource = 'custom' | 'shop' | 'kuji' | 'fund' | 'general';
export interface AdminTitleDto {
  key: string;
  /** 定制称号的 id，配置称号为 null */
  id: number | null;
  title: string;
  desc: string | null;
  note: string | null;
  source: TitleSource;
  retired: boolean;
  /** 现在拥有（没过期）的店数 */
  owners: number;
  createdBy: string | null;
  createdAt: string | null;
}

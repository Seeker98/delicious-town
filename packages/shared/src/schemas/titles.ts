import { z } from 'zod';
import { cleanTitleText, graphemeLen, TITLE_DESC_MAX, TITLE_MAX, TITLE_NOTE_MAX } from '../titleText';

/** 定制称号的键 c<id>；配置称号的 key 不能长这样（配置构建检查） */
export const CUSTOM_ICON_KEY = /^c([1-9]\d{0,9})$/;
export const iconKey = z.string().regex(/^[a-z0-9_-]{1,32}$/);

const NEWLINE = /[\r\n]/;

/**
 * 超长：按字素数超过 max，或者总长（UTF-16 码元）超过 max × 16（backlog 1010）——
 * 一个字后面叠上千个组合附加符号按字素只算 1 个；正常的复合表情一个也就十来个码元
 */
const tooLong = (c: string, max: number) => graphemeLen(c) > max || c.length > max * 16;

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
      if (tooLong(c, max)) ctx.addIssue({ code: 'custom', message: 'too_long' });
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
  .object({ key: iconKey, title: z.string().max(400).default(''), ...iconValidity })
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
      if (tooLong(cleanTitleText(s), max)) ctx.addIssue({ code: 'custom', message: 'too_long' });
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

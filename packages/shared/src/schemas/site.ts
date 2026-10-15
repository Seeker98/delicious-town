import { z } from 'zod';
import { LINK_NAME_MAX, LINK_NOTE_MAX, LINK_URL_MAX } from '../limits';

export const linkBody = z.object({
  name: z.string().trim().min(1).max(LINK_NAME_MAX),
  // 只收 http(s)：javascript: 之类的地址点开会在游戏页面里执行
  url: z
    .string()
    .trim()
    .max(LINK_URL_MAX)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: 'http_only' }),
  note: z.string().trim().max(LINK_NOTE_MAX),
  sort: z.number().int().min(-9999).max(9999),
});
export type LinkInput = z.infer<typeof linkBody>;

export interface LinkDto {
  id: number;
  name: string;
  url: string;
  note: string;
}

export interface AdminLinkDto extends LinkDto {
  sort: number;
  updatedAt: string;
}

/** 服务器时间（问题记录 348：顶栏的当前时间按服务器走） */
export interface ServerTimeDto {
  now: string;
}

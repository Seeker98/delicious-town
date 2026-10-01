import { z } from 'zod';
import { limitedText } from './mail';

export const ANNOUNCE_TITLE_MAX = 40;
export const ANNOUNCE_BODY_MAX = 2000;

export const announcementBody = z
  .object({
    shardId: z.number().int().positive().nullable(),
    title: limitedText(ANNOUNCE_TITLE_MAX),
    body: limitedText(ANNOUNCE_BODY_MAX),
    important: z.boolean(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { path: ['endsAt'], message: 'before_start' });
export type AnnouncementInput = z.infer<typeof announcementBody>;

export interface AnnouncementDto {
  id: number;
  title: string;
  body: string;
  important: boolean;
  startsAt: string;
  endsAt: string;
  /** 本账号是否已看过（只对重要公告有意义；登录页的公开接口固定为 true） */
  seen: boolean;
}
export interface AnnouncementsDto {
  items: AnnouncementDto[];
}
export interface AdminAnnouncementDto extends Omit<AnnouncementDto, 'seen'> {
  shardId: number | null;
  createdAt: string;
  updatedAt: string;
  actor: string | null;
}

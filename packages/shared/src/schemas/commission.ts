import { z } from 'zod';
import type { DailyHeadDto } from './daily';
import { COMMISSION_MEMBERS, COMMISSION_NOTICE_MAX, type CommissionMember } from '../enums';
import { limitedText } from './mail';

export const commissionMember = z.enum(COMMISSION_MEMBERS);

/** 后台发公报：shardId 为空是全部区服 */
export const commissionNoticeBody = z.object({
  shardId: z.number().int().positive().nullable(),
  member: commissionMember,
  body: limitedText(COMMISSION_NOTICE_MAX),
});
export type CommissionNoticeInput = z.infer<typeof commissionNoticeBody>;

export interface CommissionNoticeDto {
  id: number;
  member: CommissionMember;
  body: string;
  createdAt: string;
}
export interface AdminCommissionNoticeDto extends CommissionNoticeDto {
  shardId: number | null;
  /** 撤回的时间；没撤回为 null */
  deletedAt: string | null;
  actor: string | null;
}

/**
 * 章鱼哥的卫生巡查（餐厅动态 hygiene.report 的参数）：前一个游戏日的事实，只记录、不罚。
 * 蟑螂只算自己长的（好友放的不算）
 */
export interface HygieneReportParams {
  day: string;
  /** 自己长的蟑螂占桌，桌·小时，一位小数 */
  roachHours: number;
  /** 防虫设施自动灭掉的蟑螂 */
  roachAuto: number;
  /** 老鼠来了几次、偷走几份、被夹住几次 */
  mouse: number;
  stolen: number;
  trapped: number;
  /** 防蟑螂、防老鼠的设施：摆着的道具和还剩几小时；没摆为 null */
  roachDevice: { goodsId: number; hours: number } | null;
  mouseDevice: { goodsId: number; hours: number } | null;
}

/** 委员会页：公报和各位委员的今日要点 */
export interface CommissionDto {
  notices: CommissionNoticeDto[];
  brief: {
    /** 章鱼哥：全镇今天打掉的蟑螂、老鼠来的次数和偷成的次数 */
    hygiene: { roachKills: number; mouseVisits: number; mouseSteals: number };
    /** 饭老道：现在的天气和换天时间 */
    weather: { id: number; until: string };
    /** 菜园姐：限时折扣货架上还有货的食材、下一批的时间 */
    market: { foodsIds: number[]; next: string } | null;
    /** 盖乐瑞：全镇存在发展基金和理财里的银币 */
    finance: { coin: number };
    /** 13 哥：最近一份已发布的日报标题 */
    daily: DailyHeadDto | null;
  };
  /** 本店最近一次卫生巡查（2 星以下或还没巡查过为 null） */
  myHygiene: (HygieneReportParams & { at: string }) | null;
}

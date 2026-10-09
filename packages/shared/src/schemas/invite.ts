export type InviteStatus = 'pending' | 'sent' | 'capped';
export interface InviteeDto {
  /** 被邀请人等级最高的那家店；还没开店为 null */
  restName: string | null;
  shardName: string | null;
  level: number | null;
  verified: boolean;
  lv10: InviteStatus | null;
  lv30: InviteStatus | null;
}
export interface InviteDto {
  code: string;
  monthCount: number;
  monthlyCap: number;
  /** 两档奖励的等级（区服数值，backlog 1010：页面说明不再写死 10、30 级） */
  levels: { lv10: number; lv30: number };
  invitees: InviteeDto[];
}

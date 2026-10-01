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
  invitees: InviteeDto[];
}

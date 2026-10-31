import type { BarAwardDto } from './bar';

/** 许愿树（许愿树设计 2026-10-11） */
export interface WishTreeRoundDto {
  id: number;
  goodsId: number;
  num: number;
  opensAt: string;
  endsAt: string;
  /** 已有几家许愿 */
  entries: number;
}
export interface WishTreeResultDto {
  id: number;
  day: string;
  /** 开奖那天（北京时间日期）：开奖在开这一轮的第二天，最近几轮按它显示（backlog 许愿树） */
  drawDay: string;
  goodsId: number;
  num: number;
  status: 'drawn' | 'empty';
  entries: number;
  /** 中奖店；没人中、或店已删除时为 null；店名取不到时 name 为 null */
  winner: { restId: number; name: string | null } | null;
  /**
   * 我参加了这一轮：中没中、安慰奖（一份随机奖励，和酒吧小游戏的奖励同一种；还没发时为 null）；skipped：开奖时店被封号，跳过了、不发安慰奖
   * （backlog 许愿树：原来解封后一直写“马上发放”）
   */
  mine: { won: boolean; award: BarAwardDto | null; skipped: boolean } | null;
}
export interface WishTreeDto {
  enabled: boolean;
  hour: number;
  minLevel: number;
  level: number;
  /** 注册满几天才能许愿 */
  minAccountDays: number;
  /** 等级够了但卡在账号门槛：注册天数不够、没验证邮箱；能许为 null */
  gate: 'age' | 'email' | null;
  titleDays: number;
  /** 进行中的一轮；没有时为 null */
  round: WishTreeRoundDto | null;
  /** 我在进行中的一轮里许过愿 */
  wished: boolean;
  /** 最近 7 轮（开过奖的），新的在前 */
  recent: WishTreeResultDto[];
}

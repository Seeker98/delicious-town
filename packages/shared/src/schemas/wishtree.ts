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
/** 没中的安慰奖：一份随机奖励（和猜酒杯等的奖励同一种） */
export interface WishTreeAwardDto {
  kind: 'foods' | 'goods' | 'coin' | 'exp';
  /** 物品或食材 id；银币、经验为 null */
  id: number | null;
  num: number;
  lucky: boolean;
}
export interface WishTreeResultDto {
  id: number;
  day: string;
  goodsId: number;
  num: number;
  status: 'drawn' | 'empty';
  entries: number;
  /** 中奖店；没人中、或店已删除时为 null；店名取不到时 name 为 null */
  winner: { restId: number; name: string | null } | null;
  /** 我参加了这一轮：中没中、安慰奖（还没发时为 null） */
  mine: { won: boolean; award: WishTreeAwardDto | null } | null;
}
export interface WishTreeDto {
  enabled: boolean;
  hour: number;
  minLevel: number;
  level: number;
  titleDays: number;
  /** 进行中的一轮；没有时为 null */
  round: WishTreeRoundDto | null;
  /** 我在进行中的一轮里许过愿 */
  wished: boolean;
  /** 最近 7 轮（开过奖的），新的在前 */
  recent: WishTreeResultDto[];
}

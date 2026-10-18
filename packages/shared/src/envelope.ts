import type { ErrorCode } from './errors';

/** 结构化的得失提示，前端据此生成文案 */
export interface GameEvent {
  type: 'gain' | 'loss';
  kind:
    | 'goods'
    | 'foods'
    | 'coin'
    | 'diamond'
    | 'exp'
    | 'renown'
    | 'oil'
    | 'strength'
    | 'remnant'
    | 'shiling'
    | 'activityCurrency'
    /** 达成成就（成就系统 2026-10-19）：key 是成就编号，num 是点数 */
    | 'achievement';
  id?: number;
  /** 活动货币的名字（问题记录 224）：活动货币没有道具 id */
  name?: string;
  /** 成就编号（kind = achievement） */
  key?: string;
  num: number;
  lucky?: boolean;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
  events: GameEvent[];
}

export interface ErrResponse {
  ok: false;
  code: ErrorCode;
  params?: Record<string, unknown>;
}

export type ApiResponse<T> = OkResponse<T> | ErrResponse;

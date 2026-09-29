import type { ErrorCode } from './errors';

/** 结构化的得失提示，前端据此生成文案 */
export interface GameEvent {
  type: 'gain' | 'loss';
  kind: 'goods' | 'foods' | 'coin' | 'diamond' | 'exp' | 'renown' | 'oil' | 'strength';
  id?: number;
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

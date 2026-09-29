import type { ErrorCode, ErrResponse, GameEvent, OkResponse } from '@dt/shared';

export function ok<T>(data: T, events: GameEvent[] = []): OkResponse<T> {
  return { ok: true, data, events };
}

export function fail(code: ErrorCode, params?: Record<string, unknown>): ErrResponse {
  return params ? { ok: false, code, params } : { ok: false, code };
}

/** 写操作：把服务返回的 { data, events } 转成响应 */
export function okOp<T>(r: { data: T; events: GameEvent[] }): OkResponse<T> {
  return ok(r.data, r.events);
}

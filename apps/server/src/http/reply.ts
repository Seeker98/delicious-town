import type { ErrorCode, ErrResponse, GameEvent, OkResponse } from '@dt/shared';

export function ok<T>(data: T, events: GameEvent[] = []): OkResponse<T> {
  return { ok: true, data, events };
}

export function fail(code: ErrorCode, params?: Record<string, unknown>): ErrResponse {
  return params ? { ok: false, code, params } : { ok: false, code };
}

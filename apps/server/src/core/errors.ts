import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';

/** 资源不够：kind = coin / diamond / strength / goods / foods / …；goods、foods 带 id */
export function notEnough(kind: string, need: number, have: number, id?: number): AppError {
  return new AppError(
    ErrorCode.NOT_ENOUGH,
    400,
    id === undefined ? { kind, need, have } : { kind, id, need, have },
  );
}

export function requirement(reason: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.REQUIREMENT_NOT_MET, 400, { reason, ...params });
}

export function limitReached(what: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.LIMIT_REACHED, 400, { what, ...params });
}

export function invalidState(reason: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(ErrorCode.INVALID_STATE, 400, { reason, ...params });
}

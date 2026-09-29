import type { ErrorCode } from '@dt/shared';

/** 业务错误：由统一错误处理转成 {ok:false, code, params} */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly params?: Record<string, unknown>;

  constructor(code: ErrorCode, status = 400, params?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

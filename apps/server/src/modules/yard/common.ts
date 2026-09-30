import { ErrorCode } from '@dt/shared';
import { AppError } from '../../http/errors';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

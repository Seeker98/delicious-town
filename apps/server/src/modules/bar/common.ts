import { ErrorCode, type BarResultDto } from '@dt/shared';
import { AppError } from '../../http/errors';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** bar_state 的 1 / 0 / -1 → 'win' / 'draw' / 'lose' */
export function resultDto(r: number | null): BarResultDto | null {
  return r === null ? null : r === 1 ? 'win' : r === 0 ? 'draw' : 'lose';
}

import { ApiError } from '../../api/client';

/** 这一局已经不在了（比如在另一个标签页结束了）：面板应清空局面并刷新概览 */
export function roundGone(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'INVALID_STATE' && e.params.reason === 'no_round';
}

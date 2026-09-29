import type { Migration } from 'kysely';
import * as m0001 from './0001_init';

/** 迁移列表写在代码里（而不是按文件扫描），打包后也能用 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
};

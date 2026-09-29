import type { Migration } from 'kysely';
import * as m0001 from './0001_init';
import * as m0002 from './0002_business_loop';
import * as m0003 from './0003_admin_console';
import * as m0004 from './0004_friends';

/** 迁移列表写在代码里（而不是按文件扫描），打包后也能用 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_business_loop': m0002,
  '0003_admin_console': m0003,
  '0004_friends': m0004,
};

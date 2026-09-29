import { parseArgs } from 'node:util';
import { createDb } from '../db';
import { loadEnv } from '../env';
import { setRoleByUsername } from '../modules/admin/roles';

const USAGE = '用法：account role <用户名> <player|mod|admin>';
const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);

try {
  const [cmd, username, role] = positionals;
  if (cmd !== 'role' || !username || !['player', 'mod', 'admin'].includes(role ?? '')) throw new Error(USAGE);
  const id = await setRoleByUsername(db, username, role as 'player' | 'mod' | 'admin');
  console.log(`account ${id} (${username}) is now ${role}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.destroy();
}

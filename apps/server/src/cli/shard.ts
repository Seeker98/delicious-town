import { parseArgs } from 'node:util';
import { createDb } from '../db';
import { loadEnv } from '../env';

const USAGE =
  '用法：shard ensure --id <n> --name <名称> | shard open --id <n> | shard close --id <n> | shard list';
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { id: { type: 'string' }, name: { type: 'string' } },
});
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
const id = Number(values.id);

try {
  switch (positionals[0]) {
    case 'ensure': {
      if (!Number.isInteger(id) || id <= 0 || !values.name) throw new Error(USAGE);
      await db
        .insertInto('shard')
        .values({ id, name: values.name })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
      console.log(`shard ${id} ready`);
      break;
    }
    case 'open':
    case 'close': {
      if (!Number.isInteger(id) || id <= 0) throw new Error(USAGE);
      const status = positionals[0] === 'open' ? 'open' : 'closed';
      await db.updateTable('shard').set({ status }).where('id', '=', id).execute();
      console.log(`shard ${id} ${status}`);
      break;
    }
    case 'list': {
      const rows = await db.selectFrom('shard').selectAll().orderBy('id').execute();
      for (const r of rows) console.log(`${r.id}\t${r.status}\t${r.name}`);
      break;
    }
    default:
      throw new Error(USAGE);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}

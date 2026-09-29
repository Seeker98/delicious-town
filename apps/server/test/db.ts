import { createDb } from '../src/db';

export function testDb() {
  return createDb(process.env.DATABASE_URL!, 5);
}

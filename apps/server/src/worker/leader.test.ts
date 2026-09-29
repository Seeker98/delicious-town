import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { tryLead, waitForLeadership } from './leader';

const url = () => process.env.DATABASE_URL!;
const newKey = () => 400_000 + Math.floor(Math.random() * 100_000);
async function client() {
  const c = new pg.Client({ connectionString: url() });
  await c.connect();
  return c;
}

describe('leader election', () => {
  it('同一时刻只有一个主节点，主节点断开后另一个接管', async () => {
    const key = newKey();
    const a = await client();
    const b = await client();
    expect(await tryLead(a, key)).toBe(true);
    expect(await tryLead(b, key)).toBe(false);
    await a.end();
    expect(await tryLead(b, key)).toBe(true);
    await b.end();
  });

  it('waitForLeadership 在锁释放后返回；被取消时返回 null', async () => {
    const key = newKey();
    const holder = await client();
    await tryLead(holder, key);
    const waiting = waitForLeadership(url(), { key, intervalMs: 50 });
    setTimeout(() => void holder.end(), 200);
    const leader = await waiting;
    expect(leader).not.toBeNull();

    const ac = new AbortController();
    const blocked = waitForLeadership(url(), { key, intervalMs: 50, signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    expect(await blocked).toBeNull();
    await leader!.end();
  });
});

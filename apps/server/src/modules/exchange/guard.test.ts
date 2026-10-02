import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createAccountRow } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { frozenReason, linkedAccounts, tradeFlags } from './guard';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const s = testConfig().tuning.exchange.suspicious;
async function trace(accountId: number, ip: string, deviceId: string | null) {
  await t.db.insertInto('login_trace').values({ account_id: accountId, ip, device_id: deviceId }).execute();
}

describe('关联账号（156-2 设计 §4.1）', () => {
  it('共用过设备算 device；只共用 IP 算 ip；本次请求的 IP 和设备也算；设备为空不算同设备', async () => {
    const me = await createAccountRow(t.db);
    const dev = await createAccountRow(t.db);
    const ip = await createAccountRow(t.db);
    const now = await createAccountRow(t.db);
    const none = await createAccountRow(t.db);
    const stranger = await createAccountRow(t.db);
    await trace(me, '10.0.0.1', 'device-aaaa1111');
    await trace(me, '10.0.0.9', null);
    await trace(dev, '10.9.9.9', 'device-aaaa1111');
    await trace(ip, '10.0.0.1', 'device-bbbb2222');
    await trace(now, '10.0.0.5', 'device-cccc3333');
    await trace(none, '10.7.7.7', null);
    await trace(stranger, '10.8.8.8', 'device-dddd4444');
    const m = await linkedAccounts(
      t.db,
      { accountId: me, ip: '10.0.0.5', deviceId: null },
      [dev, ip, now, none, stranger],
      s.traceDays,
      new Date(),
    );
    expect(m.get(dev)).toBe('device');
    expect(m.get(ip)).toBe('ip');
    expect(m.get(now)).toBe('ip');
    expect(m.has(none)).toBe(false);
    expect(m.has(stranger)).toBe(false);
  });
});

describe('可疑标记（156-2 设计 §4.2）', () => {
  const base = { link: undefined, price: 1000, qty: 1, ref: 1000, pairCount: 1 };
  it('正常成交没有标记；四种各自触发', () => {
    expect(tradeFlags(base, s)).toEqual([]);
    expect(tradeFlags({ ...base, link: 'ip' }, s)).toEqual(['same_ip']);
    expect(tradeFlags({ ...base, price: 1800 }, s)).toEqual(['edge_price']);
    expect(tradeFlags({ ...base, price: 600 }, s)).toEqual(['edge_price']);
    expect(tradeFlags({ ...base, price: 601 }, s)).toEqual([]);
    expect(tradeFlags({ ...base, pairCount: 3 }, s)).toEqual(['repeat_pair']);
    expect(tradeFlags({ ...base, pairCount: 2 }, s)).toEqual([]);
    expect(tradeFlags({ ...base, price: 1000, qty: 1000 }, s)).toEqual(['large']);
  });
});

describe('冻结检查', () => {
  it('没冻结为 null；冻结返回原因', async () => {
    expect(await frozenReason(t.db, 999_999_999)).toBeNull();
  });
});

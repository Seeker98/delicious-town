import { describe, expect, it } from 'vitest';
import { barCupBody, barExchangeBody, barFgBody, barNumBody, barSlotBody } from './bar';

describe('酒吧接口 body', () => {
  it('出拳 0~2、杯号 1~3、数字 1~99（上限由服务端按 numMax 再查）、次数和兑换数量 1~99 的整数', () => {
    expect(barFgBody.safeParse({ hand: 2 }).success).toBe(true);
    expect(barFgBody.safeParse({ hand: 3 }).success).toBe(false);
    expect(barCupBody.safeParse({ cup: 0 }).success).toBe(false);
    expect(barCupBody.safeParse({ cup: 3 }).success).toBe(true);
    expect(barNumBody.safeParse({ num: 0 }).success).toBe(false);
    expect(barNumBody.safeParse({ num: 26 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 99 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 100 }).success).toBe(false);
    expect(barExchangeBody.safeParse({ num: 1.5 }).success).toBe(false);
  });
});

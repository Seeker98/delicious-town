import { describe, expect, it } from 'vitest';
import {
  barCupGuessBody,
  barDartsThrowBody,
  barExchangeBody,
  barFgBody,
  barNumBody,
  barSlotBody,
} from './bar';

describe('酒吧接口 body', () => {
  it('出拳 0~2、杯号从 0 起（上限由服务端按这一轮的杯子数再查）、数字 1~99（上限由服务端按 numMax 再查）、次数和兑换数量 1~99 的整数', () => {
    expect(barFgBody.safeParse({ hand: 2 }).success).toBe(true);
    expect(barFgBody.safeParse({ hand: 3 }).success).toBe(false);
    expect(barCupGuessBody.safeParse({ cup: -1, round: null }).success).toBe(false);
    expect(barCupGuessBody.safeParse({ cup: 0, round: null }).success).toBe(true);
    expect(barCupGuessBody.safeParse({ cup: 0, round: 2 }).success).toBe(true);
    expect(barCupGuessBody.safeParse({ cup: 0 }).success).toBe(false);
    expect(barNumBody.safeParse({ num: 0 }).success).toBe(false);
    expect(barNumBody.safeParse({ num: 26 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 99 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 100 }).success).toBe(false);
    expect(barExchangeBody.safeParse({ num: 1.5 }).success).toBe(false);
  });

  it('飞镖瞄准后放久了再投也能提交，由服务端按时间判分（PR28 遗留）', () => {
    expect(barDartsThrowBody.safeParse({ elapsedMs: 700_000 }).success).toBe(true);
    expect(barDartsThrowBody.safeParse({ elapsedMs: -1 }).success).toBe(false);
  });
});

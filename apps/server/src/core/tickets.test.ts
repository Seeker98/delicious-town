import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../test/config';
import { dtTicketDraws } from './tickets';

const t = testConfig().tuning.settlement;

describe('美味券抽取', () => {
  it('概率 = 基础 × 节日 + 幸运率 / 除数；幸运部分单独计数', () => {
    // 基础 0.0025，幸运率 0.3 / 150 = 0.002
    expect(dtTicketDraws(3, 0.3, 1, t, sequenceRng([0.001, 0.003, 0.9]))).toEqual({ num: 2, lucky: 1 });
    expect(dtTicketDraws(2, 0, 2, t, sequenceRng([0.004]))).toEqual({ num: 2, lucky: 0 });
    expect(dtTicketDraws(0, 1, 1, t, sequenceRng([0]))).toEqual({ num: 0, lucky: 0 });
  });
});

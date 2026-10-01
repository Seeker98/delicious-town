import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { writeFastReport } from './report';
import { buildVariants, runVariants } from './variants';

describe('快速模拟冒烟（设计 §9）', () => {
  it('2 天、每种画像 2 个、2 套数值，能跑通并写出报告', async () => {
    const config = testConfig();
    const vs = buildVariants(config, { variants: [], set: 'settlement.expMultiplier=4' }, () => ({}));
    const rs = await runVariants(
      vs,
      {
        days: 2,
        botsPerPersona: 2,
        personas: ['diligent', 'normal', 'casual'],
        seed: 1,
        start: new Date('2026-10-01T16:00:00Z'),
        side: null,
        stuckDays: 5,
      },
      config,
      false,
    );
    const dir = mkdtempSync(join(tmpdir(), 'simfast-'));
    const files = writeFastReport(dir, rs, { days: 2, bots: 2, seed: 1, side: null });
    expect(files.some((f) => f.endsWith('report.html'))).toBe(true);
    expect(existsSync(join(dir, 'report.html'))).toBe(true);
  }, 120_000);
});

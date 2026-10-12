import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundleTwNames, hantPairs, renderHantFold } from '../../scripts/gen-hant-fold.mjs';

describe('繁简对照表和配置包一致（改了食材要跑 pnpm -F @dt/web hant）', () => {
  it('逐字一致', () => {
    const bundle = JSON.parse(
      readFileSync(join(__dirname, '../../../../packages/config/generated/bundle.json'), 'utf8'),
    );
    expect(readFileSync(join(__dirname, 'hantFold.ts'), 'utf8')).toBe(
      renderHantFold(hantPairs(bundleTwNames(bundle))),
    );
  });
});

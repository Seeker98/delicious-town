import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/config';
import { IMPLEMENTED_FEATURES } from './features';

describe('功能开关说明（问题记录 126）', () => {
  it('每个已实现的功能开关都有说明，说明里没有多余的开关', () => {
    const docs = testConfig().settingDocs.features;
    expect(Object.keys(docs).sort()).toEqual([...IMPLEMENTED_FEATURES].sort());
    for (const f of IMPLEMENTED_FEATURES) expect(docs[f]!.trim().length).toBeGreaterThan(0);
  });
});

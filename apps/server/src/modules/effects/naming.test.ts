import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { effectSourceName } from './naming';

describe('加成来源名称', () => {
  it('酒吧的宿醉（4C-3）', () => {
    expect(effectSourceName({ sourceType: 'bar', sourceId: 1 }, testConfig())).toBe('宿醉');
  });
});

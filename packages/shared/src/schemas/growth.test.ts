import { describe, expect, it } from 'vitest';
import { allocateBody } from './growth';

describe('加点请求', () => {
  it('能加调味；旧网页不带调味时按 0 算', () => {
    expect(allocateBody.parse({ cook: 0, cutting: 0, fire: 0, season: 2 })).toEqual({
      cook: 0,
      cutting: 0,
      fire: 0,
      season: 2,
    });
    expect(allocateBody.parse({ cook: 1, cutting: 0, fire: 0 })).toEqual({
      cook: 1,
      cutting: 0,
      fire: 0,
      season: 0,
    });
  });
  it('一点都不加报错', () => {
    expect(allocateBody.safeParse({ cook: 0, cutting: 0, fire: 0, season: 0 }).success).toBe(false);
  });
});

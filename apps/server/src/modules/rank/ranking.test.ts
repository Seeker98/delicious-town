import { describe, expect, it } from 'vitest';
import { rankRows } from './ranking';

describe('排行', () => {
  it('并列同名次，去掉值 0，同值同 tie 按店号', () => {
    const r = rankRows([
      { restId: 5, name: 'e', value: 10 },
      { restId: 2, name: 'b', value: 30 },
      { restId: 3, name: 'c', value: 10 },
      { restId: 4, name: 'd', value: 0 },
      { restId: 1, name: 'a', value: 5 },
    ]);
    expect(r.map((x) => [x.restId, x.rank])).toEqual([
      [2, 1],
      [3, 2],
      [5, 2],
      [1, 4],
    ]);
  });
  it('tie 不同则不并列（等级同级比经验、周榜先到先排）', () => {
    const r = rankRows([
      { restId: 1, name: 'a', value: 10, tie: 5 },
      { restId: 2, name: 'b', value: 10, tie: 9 },
    ]);
    expect(r.map((x) => [x.restId, x.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });
});

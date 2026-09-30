import { describe, expect, it } from 'vitest';
import { calibrateWatchman } from './towerFloor';

describe('calibrateWatchman（设计文档裁定 1）', () => {
  it('按规格书 20.14 的比例缩放到原版厨力', () => {
    expect(calibrateWatchman(1, 1, 30)).toEqual({
      attrs: { cook: 7, cutting: 7, fire: 7, season: 4, creatives: 4, luck: 1 },
      power: 29,
    });
    expect(calibrateWatchman(10, 91, 2601)).toEqual({
      attrs: { cook: 599, cutting: 599, fire: 599, season: 331, creatives: 331, luck: 288 },
      power: 2603,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { shilingErrors } from './shiling';
import type { Tuning } from './tuning';

const weathers = [
  { id: 1, special: false },
  { id: 6, special: true },
];
const check = (roads: Array<[number, number[]]>) =>
  shilingErrors({ roads } as unknown as Tuning['shiling'], { weathers, counter: [] });

describe('当令表的检查', () => {
  it('特殊天气一道到六道全部当令（特色菜清理 2026-10-13：兽道菜删光了）；普通天气两道', () => {
    expect(
      check([
        [1, [1, 2]],
        [6, [1, 2, 3, 4, 5, 6]],
      ]),
    ).toEqual([]);
  });

  it('特殊天气少了道、写了兽道都报错', () => {
    expect(
      check([
        [1, [1, 2]],
        [6, [7]],
      ]),
    ).toEqual(['tuning.shiling roads 6: special weather must be all roads 1~6']);
    expect(
      check([
        [1, [1, 2]],
        [6, [1, 2, 3, 4, 5]],
      ]),
    ).toEqual(['tuning.shiling roads 6: special weather must be all roads 1~6']);
  });
});

import { describe, expect, it } from 'vitest';
import { foodFromRaw, formatMaster, goodsFromRaw, replaceSrc } from './master';

describe('主表（重新编号 PR 1）', () => {
  it('格式：rule + data，每条一行，结尾换行', () => {
    const text = formatMaster('说明', [{ id: 1, a: [1, 2] }, { id: 2 }]);
    expect(text).toBe('{\n "rule": "说明",\n "data": [\n  {"id":1,"a":[1,2]},\n  {"id":2}\n ]\n}\n');
    expect(JSON.parse(text)).toEqual({ rule: '说明', data: [{ id: 1, a: [1, 2] }, { id: 2 }] });
  });

  it('空表也合法', () => {
    expect(JSON.parse(formatMaster('x', []))).toEqual({ rule: 'x', data: [] });
  });

  it('原始道具转主表：编号、旧编号、小类由调用方给；value 解析成 JSON，标志位换成布尔，缺省补齐', () => {
    expect(
      goodsFromRaw(
        {
          id: 5,
          name: '甲',
          type: 9,
          devicetype: 20,
          value: '{"coinValue":2}',
          subflag: 1,
          saleflag: 0,
          awardflag: 3,
        },
        'streets',
        { id: 60014, legacyId: 5, group: 'streetMedal' },
      ),
    ).toEqual({
      id: 60014,
      legacyId: 5,
      src: 'streets',
      group: 'streetMedal',
      name: '甲',
      type: 9,
      deviceType: 20,
      invalidHours: null,
      maxNum: 9999,
      stackable: true,
      level: 1,
      coin: 0,
      diamond: 0,
      onSale: false,
      awardFlag: 3,
      desc: '',
      value: { coinValue: 2 },
    });
    expect(
      goodsFromRaw({ id: 6, name: '乙', type: 1, value: '' }, 'original', {
        id: 10001,
        legacyId: 6,
        group: 'x',
      }).value,
    ).toBeNull();
  });

  it('value 不是合法 JSON 时报错带编号（新街道勋章，质量期第 ⑦ 批）', () => {
    expect(() =>
      goodsFromRaw({ id: 6, name: '乙', type: 9, value: '{bad' }, 'streets', {
        id: 60014,
        legacyId: 92014,
        group: 'x',
      }),
    ).toThrow('goods 60014 (legacy 92014) value is not valid JSON');
  });

  it('原始食材转主表：编号、旧编号由调用方给；maxNum 缺省 999，type 缺省 null', () => {
    expect(
      foodFromRaw({ id: 7, name: '丙', level: 2, coin: 10, odds: 100 }, 'streets', { id: 2001, legacyId: 7 }),
    ).toEqual({
      id: 2001,
      legacyId: 7,
      src: 'streets',
      name: '丙',
      level: 2,
      coin: 10,
      odds: 100,
      maxNum: 999,
      type: null,
    });
  });

  it('按来历整块替换：留在原位置，别的条目不动；原来没有就接在最后', () => {
    const list = [
      { id: 1, src: 'original' },
      { id: 2, src: 'streets' },
      { id: 3, src: 'streets' },
      { id: 4, src: 'lore' },
    ];
    expect(replaceSrc(list, 'streets', [{ id: 9, src: 'streets' }])).toEqual([
      { id: 1, src: 'original' },
      { id: 9, src: 'streets' },
      { id: 4, src: 'lore' },
    ]);
    expect(replaceSrc(list, 'kuji', [{ id: 8, src: 'kuji' }]).at(-1)).toEqual({ id: 8, src: 'kuji' });
  });
});

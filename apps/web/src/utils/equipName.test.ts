import { describe, expect, it } from 'vitest';
import { equipName } from './equipName';

const names = { goodsName: (id: number) => (id === 641 ? '玉•赞助之帽' : `道具${id}`) };

describe('equipName', () => {
  it('有显示名用显示名，否则用道具名', () => {
    expect(equipName(names, { goodsId: 641, name: '玉•大橘之帽' })).toBe('玉•大橘之帽');
    expect(equipName(names, { goodsId: 641, name: null })).toBe('玉•赞助之帽');
    expect(equipName(names, { goodsId: 30, name: null })).toBe('道具30');
  });
});

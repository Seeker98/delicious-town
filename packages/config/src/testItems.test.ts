import { describe, expect, it } from 'vitest';
import { cid, fid, gid } from './testItems';

describe('测试里按名字查编号（重新编号 PR 2）', () => {
  it('道具、食材、菜谱', () => {
    expect(gid('神秘礼券')).toBe(1);
    expect(fid('大米')).toBe(101);
    expect(cid('南煎丸子')).toBe(1);
  });
  it('名字不存在时抛错', () => {
    expect(() => gid('没有这件')).toThrow('no goods named 没有这件');
  });
});

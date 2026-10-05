import { describe, expect, it } from 'vitest';
import { GOODS } from './ids';
import { realBuild } from './testBundle';
import { cid, fid, gid } from './testItems';

describe('测试里按名字查编号（重新编号 PR 2）', () => {
  it('道具、食材、菜谱', () => {
    const b = realBuild().bundle!;
    expect(gid('神秘礼券')).toBe(GOODS.mysteryTicket);
    expect(b.foods.find((f) => f.id === fid('大米'))!.name).toBe('大米');
    expect(b.cookbooks.find((c) => c.id === cid('南煎丸子'))!.name).toBe('南煎丸子');
  });
  it('名字不存在时抛错', () => {
    expect(() => gid('没有这件')).toThrow('no goods named 没有这件');
  });
});

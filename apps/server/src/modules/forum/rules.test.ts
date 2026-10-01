import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, excerpt, likePattern, normalizeText, textLength, textOk } from './rules';

describe('论坛纯规则', () => {
  it('规整文字：去掉首尾空白和 \\r，连续空行最多保留一个', () => {
    expect(normalizeText('  a\r\n\n\n\nb  ')).toBe('a\n\nb');
    expect(normalizeText('a\n\nb')).toBe('a\n\nb');
  });
  it('按字符计长度，emoji 算 1', () => {
    expect(textLength('😀ab')).toBe(3);
    expect(textOk('😀'.repeat(40), 40)).toBe(true);
    expect(textOk('a'.repeat(41), 40)).toBe(false);
    expect(textOk('', 40)).toBe(false);
  });
  it('搜索词转义 \\ % _', () => {
    expect(likePattern('5%_\\')).toBe('%5\\%\\_\\\\%');
  });
  it('游标往返；坏游标为 null', () => {
    const d = new Date('2026-10-01T04:00:00.000Z');
    expect(decodeCursor(encodeCursor(d, 7))).toEqual({ at: d, id: 7 });
    expect(decodeCursor('x')).toBeNull();
    expect(decodeCursor('1:-2')).toBeNull();
  });
  it('摘要：换行变空格，截到 n 个字符', () => {
    expect(excerpt('a\nb', 60)).toBe('a b');
    expect(excerpt('😀'.repeat(70), 60)).toBe('😀'.repeat(60));
  });
});

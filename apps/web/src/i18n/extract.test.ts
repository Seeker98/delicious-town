import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.vue', '!../**/admin/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
/** 汉字，加上全角标点（、。「」（）：，等，backlog 多语言） */
const HAN = /[一-鿿\u3000-\u303f\uff01-\uff60]/;
/** 去掉注释、图片路径（npc/菜园姐 这类是素材文件名，不是界面文案）后含汉字的行 */
function hanLines(src: string): string[] {
  const noComments = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/(["'`])npc\/[^"'`]*\1/g, '$1$1');
  return noComments.split('\n').filter((l) => HAN.test(l));
}

describe('文案抽取守卫（问题记录 272）', () => {
  it('玩家界面没有写死的中文（注释除外）', () => {
    const bad = Object.entries(SOURCES)
      .filter(([, src]) => hanLines(src).length > 0)
      .map(([p, src]) => `${p}: ${hanLines(src)[0]!.trim()}`);
    expect(bad).toEqual([]);
  });

  it('全角标点也算写死的中文（backlog 多语言：以前只查汉字，漏了首页的“（x/y）”）', () => {
    expect(hanLines('<span>（{{ a }}/{{ b }}）</span>')).toHaveLength(1);
    expect(hanLines('<span>{{ a }}：{{ b }}</span>')).toHaveLength(1);
    expect(hanLines('<span>({{ a }}/{{ b }})</span>')).toEqual([]);
  });

  it('图片路径里的中文不算', () => {
    expect(hanLines('<MascotCard img="npc/菜园姐" />')).toEqual([]);
    expect(hanLines('<b>菜园姐</b>')).toHaveLength(1);
  });
});

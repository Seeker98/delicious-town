import { describe, expect, it } from 'vitest';
import { PENDING } from './pending';

const SOURCES = import.meta.glob<string>(['../**/*.vue', '!../**/admin/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const HAN = /[一-鿿]/;
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
  it('玩家界面除待抽取白名单外没有写死的中文（注释除外）', () => {
    const bad = Object.entries(SOURCES)
      .filter(([p]) => !PENDING.includes(p))
      .filter(([, src]) => hanLines(src).length > 0)
      .map(([p, src]) => `${p}: ${hanLines(src)[0]!.trim()}`);
    expect(bad).toEqual([]);
  });

  it('图片路径里的中文不算', () => {
    expect(hanLines('<MascotCard img="npc/菜园姐" />')).toEqual([]);
    expect(hanLines('<b>菜园姐</b>')).toHaveLength(1);
  });

  it('白名单里的文件都还存在、确实还有中文（抽完了就要从白名单删掉）', () => {
    for (const p of PENDING) {
      expect(SOURCES[p], p).toBeDefined();
      expect(hanLines(SOURCES[p]!).length, p).toBeGreaterThan(0);
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_ART } from '../art/generated/names';
import { GOODS_GROUPS, goodsArt, goodsGroup } from './goodsArt';

describe('道具图形（界面改版 P7 仓库格子）', () => {
  it('小类编号段和配置 goods_groups.json 一致（配置加了小类要同步这里）', () => {
    const file = JSON.parse(
      readFileSync(join(__dirname, '../../../../packages/config/data/game/goods_groups.json'), 'utf8'),
    ) as { groups: Array<{ key: string; base: number; size: number }> };
    expect(GOODS_GROUPS.map(([key, base, size]) => ({ key, base, size }))).toEqual(
      file.groups.map(({ key, base, size }) => ({ key, base, size })),
    );
  });

  it('按编号所在小类给图；查不到的编号画箱子', () => {
    expect(goodsGroup(10302)).toBe('pass');
    expect(goodsArt(10302)).toBe('goods-ticket');
    expect(goodsArt(20105)).toBe('goods-gift');
    expect(goodsArt(62150)).toBe('goods-medal');
    expect(goodsArt(71050)).toBe('goods-souvenir');
    // 宝石按种类分颜色，一~三阶切面宝石、四~六阶玉（P7 用户反馈）
    expect(goodsArt(50203)).toBe('goods-gem-topaz');
    expect(goodsArt(50104)).toBe('goods-jade-ruby');
    expect(goodsArt(50001)).toBe('goods-gem-wisdom');
    expect(goodsArt(50506)).toBe('goods-jade-astral');
    expect(goodsArt(99999)).toBe('goods-misc');
    expect(goodsArt(61603)).toBe('goods-statue');
  });

  it('目录里单个道具写了 art 就用 goods-<art>；没这张图时退回小类的图（界面改版 P9）', () => {
    expect(goodsArt(10702, 'missile')).toBe('goods-missile');
    expect(goodsArt(10702, 'nope')).toBe('goods-scroll');
  });

  it('配置里每个写了 art 的道具都有图形 goods-<art>（界面改版 P9）', () => {
    const file = JSON.parse(
      readFileSync(join(__dirname, '../../../../packages/config/data/master/goods.json'), 'utf8'),
    ) as { data: Array<{ id: number; art?: string }> };
    const arts = file.data.filter((g) => g.art);
    expect(arts.length).toBeGreaterThan(0);
    for (const g of arts) expect(CONTENT_ART, String(g.id)).toContain(`goods-${g.art}`);
  });

  it('每个小类给的图都在雪碧图里（宝石六阶都查）', () => {
    for (const [, base] of GOODS_GROUPS) expect(CONTENT_ART).toContain(goodsArt(base));
    for (let g = 0; g < 6; g++)
      for (let tier = 1; tier <= 6; tier++) expect(CONTENT_ART).toContain(goodsArt(50000 + g * 100 + tier));
  });
});

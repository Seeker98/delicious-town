import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('许愿树配置（许愿树设计 §2）', () => {
  it('真实数据没有错误；默认值；称号在 looks.icons 里', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const w = bundle!.tuning.wishTree;
    expect(w).toMatchObject({ hour: 20, minLevel: 10, titleDays: 3, consolationLevel: 1 });
    expect(w.prizes).toHaveLength(7);
    expect(bundle!.looks.icons.find((i) => i.key === 'wish_tree')?.title).toBe('许愿成真');
  });

  it('检查：道具不存在、同一道具重复时报错', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    const first = t.wishTree.prizes[0].goods;
    t.wishTree.prizes.push({ goods: first, num: 1, weight: 1 });
    t.wishTree.prizes.push({ goods: 1, num: 1, weight: 1 });
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain(`tuning.wishTree prizes goods ${first} is listed twice`);
    expect(errors).toContain('tuning.wishTree prizes goods 1 does not exist');
  });

  it('检查：looks 里没有 wish_tree 称号时报错', () => {
    const src = source();
    const looks = JSON.parse(JSON.stringify(src['game/looks']));
    looks.icons = looks.icons.filter((i: { key: string }) => i.key !== 'wish_tree');
    const { errors } = buildBundle({ ...src, 'game/looks': looks });
    expect(errors).toContain('tuning.wishTree icon wish_tree not in looks.icons');
  });
});

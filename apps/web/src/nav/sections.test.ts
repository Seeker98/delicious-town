import { describe, expect, it } from 'vitest';
import { UI_ART } from '../art/generated/names';
import { ROOT_PATHS, SECTIONS } from './sections';

describe('底部入口（界面改版 P2a，设计 §4.1）', () => {
  it('六个入口：餐厅、食谱、橱柜、菜场、好友、小镇', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['home', 'cookbooks', 'cupboard', 'market', 'friends', 'map']);
    expect([...ROOT_PATHS]).toEqual(['/', '/cookbooks', '/cupboard', '/market', '/friends', '/map']);
  });
  it('图标都在雪碧图里', () => {
    for (const s of SECTIONS) expect(UI_ART).toContain(s.art);
  });
});

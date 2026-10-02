import { describe, expect, it } from 'vitest';
import { HIPHOP_PLACES, type HiphopPlace } from '@dt/shared';

const SOURCES = import.meta.glob<string>('../../views/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 每个公共地点的页面（9 某家餐厅在店主首页和好友店页，按店号显示） */
const VIEW: Record<Exclude<HiphopPlace, 9>, string> = {
  1: 'MarketView',
  2: 'ShopView',
  3: 'BarView',
  4: 'SocietyView',
  5: 'TowerView',
  6: 'TempleView',
  10: 'ExchangeView',
  11: 'PredictView',
  12: 'KujiView',
  13: 'TownView',
  14: 'YardView',
  15: 'TakeawayView',
};

describe('嘻哈男孩地点（问题记录 256）', () => {
  it('每个公共地点的页面都放了对应地点的嘻哈男孩卡片：他去了那里，玩家就能在那一页找到他', () => {
    for (const p of HIPHOP_PLACES) {
      if (p === 9) continue;
      const src = SOURCES[`../../views/${VIEW[p]}.vue`] ?? '';
      expect(src, VIEW[p]).toContain(`<HiphopCard :place="${p}"`);
    }
  });
});

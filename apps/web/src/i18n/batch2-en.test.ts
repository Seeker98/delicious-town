import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { useCatalogStore } from '../stores/catalog';
import { useLocaleStore } from '../stores/locale';
import { effectChips } from '../utils/effects';
import { gardenLines } from '../utils/gardenSis';
import { remainText } from '../utils/remain';
import { rewardSummary } from '../utils/reward';
import { rewardText } from '../utils/rewards';

const names = {
  goodsName: (id: number) => `G${id}`,
  foodName: (id: number) => `F${id}`,
  seedName: () => 'S',
};
const market = {
  daily: [],
  special: [],
  premium: [],
  nextDaily: '2026-10-01T10:00:00Z',
  nextSpecial: '2026-10-01T09:00:00Z',
  nextPremium: '2026-10-01T12:00:00Z',
  specialCooldownUntil: null,
  specialCooldownMin: 30,
  foodsMaxNum: 99,
  cupboardFull: true,
  manual: { hasCard: false, cost: 0 },
  guess: { period: 'p', joined: [1], last: null, cost: 0, maxPick: 3, pool: [] },
} as MarketDto;

describe('第 2 批共用文案按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：剩余时间、加成、奖励、菜园姐、目录查不到名字时的占位', async () => {
    await useLocaleStore().set('en');
    const now = Date.parse('2026-10-01T00:00:00Z');
    expect(remainText(null, now)).toBe('Permanent');
    expect(remainText('2026-10-01T00:30:00Z', now)).toBe('30 min left');
    expect(remainText('2026-10-01T02:05:00Z', now)).toBe('2 h 5 min left');
    expect(effectChips({ spRate: 0.1 })[0]!.text).toBe('Picky rate +10%');
    expect(rewardSummary({ coin: 1500, diamond: 2, goods: [{ id: 85, num: 3 }] }, names)).toBe(
      '1,500 coins, 2 diamonds, G85×3',
    );
    expect(rewardText({ kind: 'coin', id: null, num: 2000 }, names)).toBe('2,000 coins');
    const lines = gardenLines(market).map((l) => l.text);
    expect(lines).toContain('Your pantry is full. Make some room before buying more.');
    expect(lines.some((t) => /[一-鿿]/.test(t))).toBe(false);
    const c = useCatalogStore();
    expect(c.goodsName(999999)).toBe('Item 999999');
    expect(c.weatherName(999)).toBe('Weather 999');
  });
});

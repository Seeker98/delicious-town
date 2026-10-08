import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import type { OpenGuideNumbers } from '@dt/shared';
import { activeMessages } from '.';
import { useLocaleStore } from '../stores/locale';

const g: OpenGuideNumbers = {
  startStreet: { name: 'Newbie Street', cookbooks: 69 },
  star2Cookbooks: 100,
  biggestStreet: { name: 'Fusion Street II', cookbooks: 333 },
  takeaway: { star: 1, renown: 888, coin: 1_000_000, diamond: 300 },
  exchange: { level: 20, days: 7 },
  predict: { level: 20, days: 7 },
  newbieExp: { maxLevel: 40, rate: 2 },
  acquire: {
    minStar: 2,
    taxRate: 0.1,
    maxHoldings: 10,
    dividendRate: 0.05,
    tendBonus: 0.5,
    minRounds: 90,
    tendFoods: 5,
    protectDays: 3,
  },
};
const takeaway = () =>
  activeMessages()
    .wiki.guide.sections.flatMap((s) => s.items)
    .map((x) => (typeof x === 'function' ? x(g) : x))
    .find((x) => /takeaway|domicilio|emporter/.test(x))!;

describe('玩法攻略的单复数（第 ⑧ 批审查）', () => {
  afterEach(async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('zh-CN');
  });

  it('1 星、1 百万按单数写', async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('en');
    expect(takeaway()).toContain('1 star and');
    await useLocaleStore().set('es');
    expect(takeaway()).toContain('1 estrella y');
    expect(takeaway()).toContain('1 millón de monedas');
    await useLocaleStore().set('fr');
    expect(takeaway()).toContain('1 étoile et');
    expect(takeaway()).toContain('1 million de pièces');
    // 第一次切到英西法要现编译整份文案，全量测试时机器忙会超过默认的 15 秒（backlog）
  }, 60_000);
});

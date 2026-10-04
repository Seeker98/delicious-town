import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCALES } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { errorText, setNameResolver } from './zh-CN';

describe('报错文案按语言（问题记录 272）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setNameResolver({
      goodsName: (id) => (id === 85 ? 'Stamina Card' : `#${id}`),
      foodName: (id) => `food${id}`,
      mcName: (id) => `mc${id}`,
      seedName: (id) => `seed${id}`,
    });
  });
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：错误码、上限、数量不够（用目录里的名字）', async () => {
    await useLocaleStore().set('en');
    expect(errorText('UNAUTHORIZED')).toBe('Please log in first');
    expect(errorText('LIMIT_REACHED', { what: 'exchange_orders', max: 10 })).toContain('10');
    expect(errorText('NOT_ENOUGH', { kind: 'goods', id: 85, need: 3, have: 1 })).toBe(
      'Not enough Stamina Card (need 3, have 1)',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'coin', need: 3, have: 1 })).toBe(
      'Not enough Coins (need 3, have 1)',
    );
    expect(errorText('SOMETHING_NEW')).toBe('Something went wrong (SOMETHING_NEW)');
  });

  it('每种语言：所有带参数的文案都能调用，不抛错、不出现 undefined', async () => {
    for (const l of LOCALES) {
      await useLocaleStore().set(l);
      const { activeMessages } = await import('.');
      const e = activeMessages().errors;
      const p = {
        need: 1,
        have: 0,
        days: 7,
        max: 3,
        goodsId: 85,
        progress: 1,
        target: 2,
        left: 1,
        limit: 2,
        used: 1,
        cap: 4,
        name: 'X',
      };
      const n = { goodsName: () => 'G', foodName: () => 'F', mcName: () => 'M', seedName: () => 'S' };
      for (const f of [...Object.values(e.requirement), ...Object.values(e.limit)]) {
        const s = f(p, n);
        expect(s, l).not.toContain('undefined');
        expect(s.length, l).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  it('非原型属性才算：constructor 之类不会被当成文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'constructor' })).toBe('当前状态下不能这样做');
  });

  it('星级不够：服务端带了当前星级就写出来（backlog ①a）', async () => {
    const star = (have?: number) =>
      errorText(
        'REQUIREMENT_NOT_MET',
        have === undefined ? { reason: 'star', need: 4 } : { reason: 'star', need: 4, have },
      );
    expect(star()).toBe('星级不够（需要 4 星）');
    expect(star(3)).toBe('星级不够（需要 4 星，当前 3 星）');
    await useLocaleStore().set('en');
    expect(star(1)).toBe('Not enough stars (4 stars required, you have 1 star)');
    await useLocaleStore().set('fr');
    expect(star(1)).toBe("Pas assez d'étoiles (4 requises, vous en avez 1)");
    await useLocaleStore().set('es');
    expect(star(3)).toBe('No tienes suficientes estrellas (se requieren 4, tienes 3)');
  });
});

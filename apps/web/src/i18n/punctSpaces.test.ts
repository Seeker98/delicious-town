import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';

describe('法文换食材页的标点空格（问题记录 475~493 遗留）', () => {
  it('同一行里 takenLeft、storm 的“;”前都用窄不换行空格；红内裤的“:”前也是', () => {
    const x = fr.friends.exchange;
    expect(x.takenLeft(2).startsWith(' ;')).toBe(true);
    expect(x.storm.startsWith(' ;')).toBe(true);
    expect(x.redPants('Tomate')).toContain('rouge :');
  });
});

describe('西文试炼说明的百分号（集束飞弹那次的遗留）', () => {
  it('“+30 %”这类数和 % 之间用不换行空格，不会在 % 前折行', () => {
    const x = es.temple.trial;
    const text = [x.intro(5, 30, 150), ...x.helpItems].join('\n');
    expect(text).not.toMatch(/ %/);
    expect(text).toContain('+30\u00a0%');
  });
});

describe('英文“体力”统一写大写的 Stamina（532 遗留）', () => {
  it('语言包里没有小写的 stamina：别处都写 Stamina，道具叫 Stamina Card', () => {
    const text = JSON.stringify(en, (_k, v: unknown) => (typeof v === 'function' ? String(v) : v));
    expect(text.match(/\bstamina\b/g) ?? []).toEqual([]);
    expect(en.equip.detail.gemOption('Ruby', 2, 3)).toContain('costs 3 Stamina');
  });
});

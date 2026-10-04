import { describe, expect, it } from 'vitest';
import { plEn, plEs, plFr } from './helpers';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';

describe('英法西的单复数（质量期 ④，backlog #116）', () => {
  it('英文、西文只有 1 用单数；法文 0 和 1 都用单数；格式化后的大数按复数', () => {
    expect([0, 1, 2].map((n) => plEn(n, 'view', 'views'))).toEqual(['views', 'view', 'views']);
    expect([0, 1, 2].map((n) => plEs(n, 'vista', 'vistas'))).toEqual(['vistas', 'vista', 'vistas']);
    expect([0, 1, 2].map((n) => plFr(n, 'vue', 'vues'))).toEqual(['vue', 'vue', 'vues']);
    expect(plFr('1', 'pièce', 'pièces')).toBe('pièce');
    expect(plFr('1 000', 'pièce', 'pièces')).toBe('pièces');
    expect(plEn('1,000', 'coin', 'coins')).toBe('coins');
  });

  it('自检里看到的几处：奖励银币、论坛阅读数、预测注册天数、活跃送券、神殿触手', () => {
    expect(fr.util.reward.coin('1')).toBe('1 pièce');
    expect(es.util.reward.coin('1')).toBe('1 moneda');
    expect(en.util.reward.coin('2')).toBe('2 coins');
    expect(en.forum.itemMeta('A', 'now', 1, 1, 0)).toBe('A · now · 1 view · 1 like · 0 replies');
    expect(fr.predict.reasons.predict_age(1)).toContain('au moins 1 jour pour');
    expect(fr.rest.tasks.kujiHint(150, 1)).toContain('1 ticket d');
    expect(fr.temple.kraken.exchange(1)).toBe('Échanger (1 tentacule)');
  });

  it('后面的形容词、动词跟着名词变：1 recette oubliée、1 restaurant a participé', () => {
    expect(fr.town.classroom.stealFailed(1, '')).toContain('1 recette oubliée');
    expect(fr.town.classroom.stealFailed(2, '')).toContain('2 recettes oubliées');
  });
});

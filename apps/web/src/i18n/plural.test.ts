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

  it('终审：动词在前、句中别处的动词分词也跟着数字变；英文两个词的名词；按数量不按等级（质量期 ④ 终审）', () => {
    expect(es.market.sis.specialLeft(1)).toBe('Queda 1 oferta. ¡Date prisa!');
    expect(es.market.sis.specialLeft(2)).toBe('Quedan 2 ofertas. ¡Date prisa!');
    expect(es.bar.darts.draw(1)).toBe('empate. Se devuelve 1 vale misterioso');
    expect(fr.friends.thumbsToday(1)).toContain('1 personne vous a donné');
    expect(fr.bar.darts.draw(1)).toBe('égalité. 1 bon mystère remboursé');
    expect(en.town.blessRandom('1', 5)).toBe('5 random level 1 ingredients');
    expect(en.kuji.bought(1)).toBe('Bought 1 kuji ticket');
    expect(en.bar.darts.draw(1)).toBe('a draw. 1 Mystery Voucher refunded');
  });

  it('配置值正好是 1 时动词也跟着变：好友加成人数上限（backlog #116）', () => {
    expect(en.misc.invite.rules(1)).toContain('Up to 1 friend counts per month');
    expect(en.misc.invite.rules(5)).toContain('Up to 5 friends count per month');
    expect(fr.misc.invite.rules(1)).toContain('1 ami au plus compte par mois');
    expect(es.misc.invite.rules(1)).toContain('Cuenta como máximo 1 amigo al mes');
  });
});

import { describe, expect, it } from 'vitest';
import { finalRates, setFinalRates } from './streetDesc';

describe('街道勋章说明里的最终银币、经验收益（问题记录 378）', () => {
  it('四种语言都认得出：合在一起的、分开的、长短两种写法', () => {
    expect(finalRates('zh-CN', '最终经验和银币收益+15%, 幸运值+10')).toEqual({
      coinRate: 0.15,
      expRate: 0.15,
    });
    expect(finalRates('zh-CN', '挑剔率+5%, 耗油-50%, 最终银币收益-20%')).toEqual({
      coinRate: -0.2,
      expRate: 0,
    });
    expect(finalRates('zh-CN', '每桌经验+4, 最终油耗+2')).toEqual({ coinRate: 0, expRate: 0 });
    // 逗号改成“, ”之前的写法（不带空格、中文逗号）照样认（问题记录 534）
    expect(finalRates('zh-CN', '挑剔率+5%,耗油-50%，最终银币收益-20%')).toEqual({
      coinRate: -0.2,
      expRate: 0,
    });
    expect(finalRates('en', 'Final EXP and coin income +15%, luck +10')).toEqual({
      coinRate: 0.15,
      expRate: 0.15,
    });
    expect(finalRates('en', 'Picky rate +5%, oil use -50%, final coins -20%')).toEqual({
      coinRate: -0.2,
      expRate: 0,
    });
    expect(finalRates('en', 'Final EXP income +40%, luck +10')).toEqual({ coinRate: 0, expRate: 0.4 });
    expect(finalRates('fr', 'EXP et revenus finaux en pièces +15 %, chance +10')).toEqual({
      coinRate: 0.15,
      expRate: 0.15,
    });
    expect(finalRates('fr', 'Revenus finaux en pièces +25 %, EXP par table +2')).toEqual({
      coinRate: 0.25,
      expRate: 0,
    });
    expect(finalRates('fr', 'chance +25, EXP finale +8 %')).toEqual({ coinRate: 0, expRate: 0.08 });
    expect(finalRates('es', 'EXP y monedas finales +15%, suerte +10')).toEqual({
      coinRate: 0.15,
      expRate: 0.15,
    });
    expect(finalRates('es', 'Ingresos finales de monedas +25%, EXP por mesa +2')).toEqual({
      coinRate: 0.25,
      expRate: 0,
    });
    expect(finalRates('es', 'suerte +25, EXP final +8%')).toEqual({ coinRate: 0, expRate: 0.08 });
  });

  it('改写：去掉原来的最终收益，按新值写在最前面；首字母大小写跟着位置走', () => {
    expect(setFinalRates('zh-CN', '最终经验和银币收益+15%, 幸运值+10', 0.1, 0.4)).toBe(
      '最终银币收益+10%, 最终经验收益+40%, 幸运值+10',
    );
    expect(setFinalRates('zh-CN', '每桌经验+4, 最终油耗+2', -0.1, -0.1)).toBe(
      '最终经验和银币收益-10%, 每桌经验+4, 最终油耗+2',
    );
    expect(setFinalRates('zh-CN', '最终经验收益+40%, 幸运值+10', 0, 0)).toBe('幸运值+10');
    expect(setFinalRates('en', 'Picky rate +5%, oil use -50%, final coins -20%', -0.2, 0.3)).toBe(
      'Final coins -20%, final EXP +30%, picky rate +5%, oil use -50%',
    );
    expect(setFinalRates('en', 'EXP per table +4, final oil use +2', 0.05, 0)).toBe(
      'Final coins +5%, EXP per table +4, final oil use +2',
    );
    expect(setFinalRates('fr', 'Clients difficiles +5 %, pièces finales -20 %', 0.25, 0.25)).toBe(
      'EXP et pièces finales +25 %, clients difficiles +5 %',
    );
    expect(setFinalRates('es', 'Monedas finales +25%, EXP por mesa +2', 0, 0.15)).toBe(
      'EXP final +15%, EXP por mesa +2',
    );
  });

  it('改写后再认，得到写进去的值', () => {
    for (const lang of ['zh-CN', 'en', 'fr', 'es'] as const)
      expect(finalRates(lang, setFinalRates(lang, '', 0.45, -0.05))).toEqual({
        coinRate: 0.45,
        expRate: -0.05,
      });
  });
});

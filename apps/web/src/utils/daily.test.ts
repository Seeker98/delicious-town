import { describe, expect, it } from 'vitest';
import { dailyLang, dailyParagraphs, dailyPlain } from './daily';

const names = (k: string, id: number) => `${k}${id}`;

describe('小镇日报正文', () => {
  it('按空行分段；店换成名字和链接，关了的店没有链接；其他记号按语言换名字', () => {
    const p = dailyParagraphs(
      '{r:1} 拿到 {g:10704}×1, 天气 {w:17}。\n\n{r:2} 搬到 {s:29}',
      { 1: '小面馆', 2: null },
      names,
      '已关店',
    );
    expect(p).toEqual([
      [
        { kind: 'rest', id: 1, text: '小面馆' },
        { kind: 'text', text: ' 拿到 ' },
        { kind: 'text', text: 'g10704' },
        { kind: 'text', text: '×1, 天气 ' },
        { kind: 'text', text: 'w17' },
        { kind: 'text', text: '。' },
      ],
      [
        { kind: 'text', text: '已关店' },
        { kind: 'text', text: ' 搬到 ' },
        { kind: 'text', text: 's29' },
      ],
    ]);
  });

  it('AI 用单个换行分段时也分开（backlog）', () => {
    expect(dailyParagraphs('第一段\n第二段\n\n\n第三段', {}, names, '已关店')).toHaveLength(3);
  });

  it('标题：记号换成纯文字', () => {
    expect(dailyPlain('{r:1} 的好日子 {f:7}', { 1: '小面馆' }, names, '已关店')).toBe('小面馆 的好日子 f7');
    expect(dailyPlain('{r:9} 来了', {}, names, '已关店')).toBe('已关店 来了');
  });

  it('语言：简中、繁中、英文看各自的；西语、法语看英文并提示', () => {
    expect(dailyLang('zh-CN')).toEqual({ lang: 'zh-CN', englishOnly: false });
    expect(dailyLang('zh-TW')).toEqual({ lang: 'zh-TW', englishOnly: false });
    expect(dailyLang('en')).toEqual({ lang: 'en', englishOnly: false });
    expect(dailyLang('es')).toEqual({ lang: 'en', englishOnly: true });
    expect(dailyLang('fr')).toEqual({ lang: 'en', englishOnly: true });
  });
});

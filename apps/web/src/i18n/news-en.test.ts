import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCALES, NEWS_TYPES, type NewsDto } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { eventsSummary, logText } from '../utils/events';
import { foodLevelLabel, shortNum } from '../utils/format';
import { CUSTOMER_NAMES, GRADE_NAMES } from '../utils/labels';
import { newsRendered, newsText } from '../utils/news';

const names = {
  goodsName: (id: number) => `G${id}`,
  foodName: (id: number) => `F${id}`,
  mcName: (id: number) => `M${id}`,
  weatherName: (id: number) => `W${id}`,
  streetName: (id: number) => `S${id}`,
  seedName: (id: number) => `D${id}`,
};
const news = (type: string, params: Record<string, unknown> = {}): NewsDto =>
  ({ id: 1, type, restId: 1, restName: 'Bob', params, createdAt: '2026-10-02T00:00:00Z' }) as NewsDto;

describe('新闻、日志、标签按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：新闻、事件预测开奖、得失提示、日志、标签', async () => {
    await useLocaleStore().set('en');
    expect(newsText(news('kuji.win', { tier: 'B' }), names)).toBe('Bob won a B prize in Ichiban Kuji');
    expect(newsText(news('fund.big', { tier: 'A', coin: 10_000_000 }), names)).toContain('[Bob]');
    expect(newsText(news('fund.big', { tier: 'A', coin: 10_000_000 }), names)).toContain('10,000,000');
    expect(
      newsText(
        news('predict.result', { title: 'Rain?', outcome: true, players: 12, winners: 7, paid: 85000 }),
        names,
      ),
    ).toBe(
      'Prediction "Rain?" resolved: Yes. 12 restaurants took part, 7 got it right, 85,000 coins paid out',
    );
    expect(eventsSummary([{ type: 'gain', kind: 'coin', num: 1500 }] as never, names)).toBe(
      'Gained Coins 1,500',
    );
    expect(logText({ type: 'level.up', params: { to: 12 } } as never, names)).toBe(
      'Restaurant reached level 12',
    );
    expect(CUSTOMER_NAMES['2']).toBe('Picky customer');
    expect(GRADE_NAMES[1]).toBe('Common');
    expect(foodLevelLabel(9)).toBe('Universal');
    expect(shortNum(123456789)).toBe('123.46M');
    expect(shortNum(12345)).toBe('12.3K');
  });

  it('每种语言：每种新闻类型都有文案，渲染不出现 undefined', async () => {
    for (const l of LOCALES) {
      await useLocaleStore().set(l);
      expect(
        NEWS_TYPES.filter((x) => !newsRendered().includes(x)),
        l,
      ).toEqual([]);
      for (const t of NEWS_TYPES)
        expect(newsText(news(t, { tier: 'A' }), names), `${l} ${t}`).not.toContain('undefined');
    }
  }, 30_000);
});

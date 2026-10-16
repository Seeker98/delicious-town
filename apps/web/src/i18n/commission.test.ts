import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewsDto, RestLogDto } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { logText } from '../utils/events';
import { feedLink } from '../utils/feed';
import { newsText } from '../utils/news';

const names = {
  goodsName: (id: number) => `G${id}`,
  foodName: (id: number) => `F${id}`,
  mcName: (id: number) => `M${id}`,
  weatherName: (id: number) => `W${id}`,
  streetName: (id: number) => `S${id}`,
};
const report = (patch: Record<string, unknown> = {}): RestLogDto => ({
  type: 'hygiene.report',
  params: {
    day: '2026-10-05',
    roachHours: 3.2,
    roachAuto: 2,
    mouse: 4,
    stolen: 5,
    trapped: 1,
    roachDevice: { goodsId: 7, hours: 30 },
    mouseDevice: null,
    ...patch,
  },
  at: '2026-10-05T16:00:00.000Z',
});
const notice = (params: Record<string, unknown>): NewsDto =>
  ({ id: 1, type: 'commission.notice', restId: null, restName: null, params, createdAt: '' }) as NewsDto;

describe('章鱼哥的卫生巡查、委员会公报的文案（小镇委员会 2026-10-16）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('简中：只写事实；剩一天以上写天和小时；什么都没有时也说清楚', () => {
    expect(logText(report(), names)).toBe(
      '章鱼哥来巡查 (10/5): 蟑螂占桌 3.2 桌·小时, 防虫设施灭了 2 只；老鼠来了 4 次, 偷走 5 份, 夹住 1 次；G7还剩 1 天 6 小时, 没摆防老鼠的设施',
    );
    expect(
      logText(
        report({
          roachHours: 0,
          roachAuto: 0,
          mouse: 0,
          roachDevice: null,
          mouseDevice: { goodsId: 8, hours: 5 },
        }),
        names,
      ),
    ).toBe('章鱼哥来巡查 (10/5): 没有蟑螂占桌；老鼠没来；没摆防蟑螂的设施, G8还剩 5 小时');
  });

  it('英法西：单复数、日期顺序；法文冒号前是窄空格', async () => {
    await useLocaleStore().set('en');
    expect(logText(report({ roachHours: 1, mouse: 1, stolen: 1 }), names)).toBe(
      "Squidward's hygiene check (10/5): roaches took up tables for 1 table-hour, pest control killed 2; mice came 1 time, stole 1 serving, 1 trapped; G7: 1d 6h left, no mouse control placed",
    );
    await useLocaleStore().set('fr');
    expect(logText(report(), names)).toContain(
      'Inspection d’hygiène de Carlo (5/10)\u202f: cafards sur les tables pendant 3,2 tables-heures',
    );
    await useLocaleStore().set('es');
    expect(logText(report(), names)).toContain(
      'Inspección de higiene de Calamardo (5/10): cucarachas en las mesas durante 3,2 horas-mesa',
    );
  });

  it('点巡查去委员会页打开章鱼哥的面板', () => {
    expect(feedLink(report())).toBe('/commission?m=squid');
  });

  it('公报在小镇新闻里带署名和职务；不认识的委员只写内容', async () => {
    expect(newsText(notice({ member: 'squid', text: '每天巡查' }), names)).toBe(
      '【公报】章鱼哥 (卫生与食品安全委员): 每天巡查',
    );
    expect(newsText(notice({ member: 'krab', text: '每天巡查' }), names)).toBe('【公报】每天巡查');
    await useLocaleStore().set('en');
    expect(newsText(notice({ member: 'gary', text: 'x' }), names)).toBe(
      '[Notice] Gary (Commissioner for Economy and Finance): x',
    );
  });
});

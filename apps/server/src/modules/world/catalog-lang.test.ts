import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { I18nTable } from '@dt/config';
import type { CatalogDto } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { localizeCatalog } from './service';

let http: TestContext;
beforeAll(async () => {
  http = await createTestApp();
});
afterAll(() => http.close());

const base = {
  version: 'v1',
  goods: [{ id: 85, name: '体力卡', desc: '恢复体力', type: 0 }],
  foods: [{ id: 7, name: '雪蛤', level: 3 }],
  streets: [{ id: 1, name: '新手街', cookName: '新手菜' }],
  weather: [{ id: 1, name: '晴' }],
  devices: [{ id: 3, name: '奖杯', deviceType: 2, needStar: 0 }],
  suits: [{ id: 9, name: '阿卡玛的神谕', maxNum: 5, tiers: [] }],
  mysterious: [{ id: 2, name: '佛跳墙' }],
} as unknown as CatalogDto;
const empty = (): I18nTable => ({
  goods: {},
  foods: {},
  weather: {},
  streets: {},
  devices: {},
  suits: {},
  mysterious: {},
});

describe('道具目录按语言（问题记录 272）', () => {
  it('有翻译的用翻译，没翻译的字段和条目回退到简中；版本带语言后缀', () => {
    const t = empty();
    t.goods['85'] = { name: 'Stamina Card' };
    t.foods['7'] = { name: 'Snow frog' };
    t.mysterious['2'] = { name: 'Buddha Jumps Over the Wall' };
    const c = localizeCatalog(base, t, 'en');
    expect(c.version).toBe('v1:en');
    expect(c.goods[0]).toMatchObject({ id: 85, name: 'Stamina Card', desc: '恢复体力', type: 0 });
    expect(c.foods[0]!.name).toBe('Snow frog');
    expect(c.weather[0]!.name).toBe('晴');
    expect(c.streets[0]).toMatchObject({ name: '新手街', cookName: '新手菜' });
    expect(c.mysterious![0]!.name).toBe('Buddha Jumps Over the Wall');
    // 不改原对象
    expect(base.goods[0]!.name).toBe('体力卡');
  });

  it('简中原样返回', () => {
    expect(localizeCatalog(base, undefined, 'zh-CN')).toBe(base);
  });

  it('接口：?lang=zh-TW 返回繁体名字；不支持的语言 400；不带语言和原来一样', async () => {
    const config = testConfig();
    const tw = await call(http.app, 'GET', '/api/v1/world/catalog?lang=zh-TW');
    expect(tw.status).toBe(200);
    expect(tw.json.data.version).toBe(`${config.version}:zh-TW`);
    expect(tw.json.data.goods.find((g: { name: string }) => g.name === '體力卡')).toBeTruthy();
    expect((await call(http.app, 'GET', '/api/v1/world/catalog?lang=xx')).status).toBe(400);
    const plain = await call(http.app, 'GET', '/api/v1/world/catalog');
    expect(plain.json.data.version).toBe(config.version);
    expect(plain.json.data.goods.find((g: { name: string }) => g.name === '体力卡')).toBeTruthy();
  });
});

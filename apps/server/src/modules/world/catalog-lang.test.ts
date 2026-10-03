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
  doors: {},
  avatars: {},
  icons: {},
  tasks: {},
  activation: {},
  bless: {},
  tower: {},
  formulas: {},
  kujiThemes: {},
  proficiency: {},
  cookbooks: {},
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

  it('第 8 批：天气说明、菜系名、套装各档说明、门、头像、个性图标也按语言（问题记录 272）', () => {
    const b = {
      ...base,
      weather: [{ id: 1, name: '晴', note: '经营: 上座率+3%' }],
      suits: [{ id: 9, name: '阿卡玛的神谕', maxNum: 5, tiers: [{ need: 4, desc: '厨艺+8%' }] }],
      looks: {
        doors: [{ id: 1, name: '红漆门', coin: 20000 }],
        avatars: [{ id: 2, name: '大厨' }],
        icons: [{ key: 'founder', title: '开服元老', desc: '开服第一周加入小镇' }],
      },
    } as unknown as CatalogDto;
    const t = empty();
    t.weather['1'] = { name: 'Sunny', note: 'Business: occupancy +3%' };
    t.streets['1'] = { name: 'Newbie Street', desc: 'x', cookName: 'Home cooking' };
    t.suits['9'] = { name: "Akatma's Oracle", tiers: ['Cooking +8%'] };
    t.doors['1'] = { name: 'Red Lacquer Door' };
    t.avatars['2'] = { name: 'Head Chef' };
    t.icons.founder = { title: 'Founding Member', desc: 'Joined town in the first week' };
    const c = localizeCatalog(b, t, 'en');
    expect(c.weather[0]).toEqual({ id: 1, name: 'Sunny', note: 'Business: occupancy +3%' });
    expect(c.streets[0]).toEqual({ id: 1, name: 'Newbie Street', cookName: 'Home cooking' });
    expect(c.suits![0]).toEqual({
      id: 9,
      name: "Akatma's Oracle",
      maxNum: 5,
      tiers: [{ need: 4, desc: 'Cooking +8%' }],
    });
    expect(c.looks!.doors[0]).toEqual({ id: 1, name: 'Red Lacquer Door', coin: 20000 });
    expect(c.looks!.avatars[0]!.name).toBe('Head Chef');
    expect(c.looks!.icons[0]).toEqual({
      key: 'founder',
      title: 'Founding Member',
      desc: 'Joined town in the first week',
    });
  });

  it('第 8c 批：任务、厨塔各层、一番赏主题等按语言；没翻译的保留原文（问题记录 272）', () => {
    const b = {
      ...base,
      data: {
        tasks: [{ id: 1, name: '填一次油' }],
        activation: [{ id: 3, name: '打蟑螂' }],
        bless: [],
        tower: [{ id: 1, name: '见习模范餐厅', title: '见习守护者', note: '来吧' }],
        formulas: [],
        kujiThemes: [{ id: 1, name: '新春年味', desc: '锣鼓一响' }],
        proficiency: [{ id: 1, name: '初学' }],
        cookbooks: [{ id: 1, name: '南煎丸子' }],
      },
    } as unknown as CatalogDto;
    const t = empty();
    t.tasks['1'] = { name: 'Refill oil once' };
    t.tower['1'] = { name: 'Apprentice Model Restaurant', title: 'Apprentice Guardian', note: 'Come on' };
    t.kujiThemes['1'] = { name: 'Spring Festival Flavors', desc: 'The drums sound' };
    t.cookbooks['1'] = { name: 'Southern Pan-fried Meatballs' };
    const c = localizeCatalog(b, t, 'en');
    expect(c.data!.tasks[0]).toEqual({ id: 1, name: 'Refill oil once' });
    expect(c.data!.activation[0]!.name).toBe('打蟑螂');
    expect(c.data!.tower[0]).toEqual({
      id: 1,
      name: 'Apprentice Model Restaurant',
      title: 'Apprentice Guardian',
      note: 'Come on',
    });
    expect(c.data!.kujiThemes[0]).toEqual({
      id: 1,
      name: 'Spring Festival Flavors',
      desc: 'The drums sound',
    });
    expect(c.data!.proficiency[0]!.name).toBe('初学');
    expect(c.data!.cookbooks[0]!.name).toBe('Southern Pan-fried Meatballs');
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

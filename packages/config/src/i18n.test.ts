import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';
import { realBuild } from './testBundle';

const src = () => readSourceDir(defaultDataDir());

describe('游戏数据翻译（问题记录 272）', () => {
  it('繁中由简中自动转换：道具名和说明、食材、天气都有', () => {
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    const tw = bundle!.i18n['zh-TW'];
    const g = bundle!.goods.find((x) => x.name === '体力卡')!;
    expect(tw.goods[String(g.id)]!.name).toBe('體力卡');
    expect(tw.goods[String(g.id)]!.desc).toBeTruthy();
    expect(Object.keys(tw.foods).length).toBe(bundle!.foods.length);
    expect(Object.keys(tw.weather).length).toBe(bundle!.weather.length);
  });

  it('英法西：数据文件里有的才有；id 不存在、字段不对时构建报错', () => {
    expect(realBuild().bundle!.i18n.en.goods).toEqual({});
    const s = src();
    const foodId = String(realBuild().bundle!.foods[0]!.id);
    const { errors } = buildBundle({
      ...s,
      'i18n/en/goods': { '99999999': { name: 'X' }, '85': { nam: 'Y' } },
      'i18n/fr/foods': { [foodId]: { name: 3 } },
    });
    const all = errors.join('\n');
    expect(all).toMatch(/i18n en goods unknown id 99999999/);
    expect(all).toMatch(/i18n en goods 85 unknown field nam/);
    expect(all).toMatch(new RegExp(`i18n fr foods ${foodId} name must be a string`));
  });

  it('翻译数据合法时进 bundle', () => {
    const s = src();
    const food = realBuild().bundle!.foods[0]!;
    const { bundle, errors } = buildBundle({
      ...s,
      'i18n/es/foods': { [String(food.id)]: { name: 'Arroz' } },
    });
    expect(errors).toEqual([]);
    expect(bundle!.i18n.es.foods[String(food.id)]).toEqual({ name: 'Arroz' });
  });
});

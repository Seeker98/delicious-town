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

describe('第 8 批常见数据翻译（问题记录 272）', () => {
  /** 这些种类英法西要全部翻完：每个 id、每个能翻的字段都有 */
  const FULL = [
    'goods',
    'foods',
    'weather',
    'streets',
    'devices',
    'suits',
    'doors',
    'avatars',
    'icons',
    'tasks',
    'chapters',
    'questLines',
    'activation',
    'bless',
    'tower',
    'formulas',
    'kujiThemes',
    'proficiency',
    'cookbooks',
    'mysterious',
  ] as const;

  it('繁中也转换街道菜系名、天气说明、套装各档说明和装扮', () => {
    const b = realBuild().bundle!;
    const tw = b.i18n['zh-TW'];
    expect(tw.streets['1']!.cookName).toBe('湘菜');
    expect(tw.weather['4']!.note).toContain('合成與分解');
    expect(tw.suits['3']!.tiers).toEqual(
      b.suits.find((s) => s.id === 3)!.tiers.map(() => expect.any(String)),
    );
    expect(tw.doors['1']!.name).toBe('紅漆門');
    expect(tw.icons.founder!.title).toBe('開服元老');
  });

  it('英法西：这几类每个 id、每个字段都翻了；套装各档说明条数对得上', () => {
    const b = realBuild().bundle!;
    const lists: Record<(typeof FULL)[number], Array<{ id: string; fields: string[]; tiers?: number }>> = {
      goods: b.goods.map((x) => ({ id: String(x.id), fields: ['name', 'desc'] })),
      foods: b.foods.map((x) => ({ id: String(x.id), fields: ['name'] })),
      weather: b.weather.map((x) => ({ id: String(x.id), fields: ['name', 'note'] })),
      streets: b.streets.map((x) => ({ id: String(x.id), fields: ['name', 'desc', 'cookName'] })),
      devices: b.devices.map((x) => ({ id: String(x.id), fields: ['name'] })),
      suits: b.suits.map((x) => ({ id: String(x.id), fields: ['name'], tiers: x.tiers.length })),
      doors: b.looks.doors.map((x) => ({ id: String(x.id), fields: ['name'] })),
      avatars: b.looks.avatars.map((x) => ({ id: String(x.id), fields: ['name'] })),
      icons: b.looks.icons.map((x) => ({ id: x.key, fields: ['title', 'desc'] })),
      // 问题记录 318：任务名是主线、支线、每周任务
      tasks: [...b.quests, ...b.weeklyGroups.flatMap((g) => g.quests)].map((x) => ({
        id: String(x.id),
        fields: ['name'],
      })),
      chapters: b.chapters.map((x) => ({ id: String(x.id), fields: ['name'] })),
      questLines: b.questLines.map((x) => ({ id: String(x.id), fields: ['name'] })),
      activation: b.activationTasks.map((x) => ({ id: String(x.id), fields: ['name'] })),
      bless: b.bless.map((x) => ({ id: String(x.id), fields: ['name'] })),
      tower: [...b.towerFloors.values()].map((x) => ({
        id: String(x.floor),
        fields: ['name', 'title', 'note'],
      })),
      formulas: [...b.formulas.values()].map((x) => ({ id: String(x.id), fields: ['name'] })),
      kujiThemes: b.kujiThemes.map((x) => ({ id: String(x.month), fields: ['name', 'desc'] })),
      proficiency: b.mcProficiency.map((x) => ({ id: String(x.curlevel), fields: ['name'] })),
      cookbooks: b.cookbooks.map((x) => ({ id: String(x.id), fields: ['name'] })),
      mysterious: b.mysteriousCookbooks.map((x) => ({ id: String(x.id), fields: ['name'] })),
    };
    for (const l of ['en', 'fr', 'es'] as const)
      for (const k of FULL)
        for (const x of lists[k]) {
          const e = b.i18n[l][k][x.id] as Record<string, unknown> | undefined;
          for (const f of x.fields) expect(e?.[f], `${l} ${k} ${x.id} ${f}`).toEqual(expect.any(String));
          if (x.tiers !== undefined)
            expect((e?.tiers as unknown[]).length, `${l} suits ${x.id} tiers`).toBe(x.tiers);
        }
  });

  it('套装各档说明要是字符串数组；装扮 key 不存在时构建报错', () => {
    const { errors } = buildBundle({
      ...src(),
      'i18n/en/suits': { '3': { name: 'S', tiers: 'x' } },
      'i18n/en/icons': { nope: { title: 'X' } },
    });
    const all = errors.join('\n');
    expect(all).toMatch(/i18n en suits 3 tiers must be an array of strings/);
    expect(all).toMatch(/i18n en icons unknown id nope/);
  });
});

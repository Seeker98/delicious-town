import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from './catalog';
import { useLocaleStore } from './locale';

vi.mock('../api/endpoints', () => ({ endpoints: { catalog: vi.fn() } }));

const cat = (name: string, version = 'v1'): CatalogDto =>
  ({
    version,
    goods: [{ id: 85, name, type: 0 }],
    foods: [],
    streets: [],
    weather: [],
    devices: [],
  }) as never;

describe('道具目录按语言（问题记录 272）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    try {
      localStorage.clear();
    } catch {
      // 忽略
    }
  });
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('按当前语言请求，浏览器缓存按语言分开', async () => {
    vi.mocked(endpoints.catalog).mockResolvedValue(cat('体力卡'));
    await useCatalogStore().load();
    expect(endpoints.catalog).toHaveBeenCalledWith('zh-CN');
    expect(localStorage.getItem('dt_catalog_zh-CN')).toContain('体力卡');
    expect(useCatalogStore().goodsName(85)).toBe('体力卡');
  });

  it('切换语言后重新读目录，名字跟着变', async () => {
    vi.mocked(endpoints.catalog).mockResolvedValueOnce(cat('体力卡'));
    const c = useCatalogStore();
    await c.load();
    vi.mocked(endpoints.catalog).mockResolvedValueOnce(cat('Stamina Card', 'v1:en'));
    await useLocaleStore().set('en');
    await vi.waitFor(() => expect(c.goodsName(85)).toBe('Stamina Card'));
    expect(endpoints.catalog).toHaveBeenLastCalledWith('en');
    expect(localStorage.getItem('dt_catalog_en')).toContain('Stamina Card');
  });

  it('还没读过目录时切换语言不额外请求', async () => {
    await useLocaleStore().set('fr');
    expect(endpoints.catalog).not.toHaveBeenCalled();
  });
  it('首次读目录途中切了语言（登录后跟账号语言）：按新语言重读，目录不会一直空着', async () => {
    let resolveFirst!: (c: CatalogDto) => void;
    vi.mocked(endpoints.catalog)
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)) as never)
      .mockResolvedValueOnce(cat('Stamina Card', 'v1:en'));
    const c = useCatalogStore();
    const loading = c.load();
    await useLocaleStore().set('en');
    resolveFirst(cat('体力卡'));
    await loading;
    expect(endpoints.catalog).toHaveBeenLastCalledWith('en');
    expect(c.loaded).toBe(true);
    expect(c.goodsName(85)).toBe('Stamina Card');
  });
});

describe('第 8 批：目录里的天气说明、个性图标，查不到时用服务端给的名字（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('天气名和说明、个性图标、街道名按目录取；目录里没有时用给定的名字', () => {
    const c = useCatalogStore();
    c.apply({
      ...cat('x'),
      weather: [{ id: 1, name: 'Sunny', note: 'Business: occupancy +3%' }],
      streets: [{ id: 2, name: 'Guangdong Street', cookName: 'Cantonese cuisine' }],
      looks: {
        doors: [],
        avatars: [],
        icons: [{ key: 'founder', title: 'Founding Member', desc: 'First week' }],
      },
    } as never);
    expect(c.weatherName(1)).toBe('Sunny');
    expect(c.weatherName(9, '暴雨')).toBe('暴雨');
    expect(c.weatherNote(1)).toBe('Business: occupancy +3%');
    expect(c.weatherNote(9)).toBeUndefined();
    expect(c.streetName(2)).toBe('Guangdong Street');
    expect(c.streetName(5, '湖南街')).toBe('湖南街');
    expect(c.icon('founder')).toEqual({ key: 'founder', title: 'Founding Member', desc: 'First week' });
    expect(c.icon('nope')).toBeUndefined();
  });
});

describe('第 8c 批：任务、厨塔各层等按 id 取名字（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('目录里有就返回当前语言的条目；没有返回 undefined', () => {
    const c = useCatalogStore();
    c.apply({
      ...cat('x'),
      data: {
        tasks: [{ id: 1, name: 'Refill oil once' }],
        activation: [],
        bless: [],
        tower: [{ id: 2, name: 'Junior Model Restaurant', title: 'Junior Guardian', note: 'Hi' }],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
      },
    } as never);
    expect(c.data('tasks', 1)?.name).toBe('Refill oil once');
    expect(c.data('tower', 2)).toEqual({
      id: 2,
      name: 'Junior Model Restaurant',
      title: 'Junior Guardian',
      note: 'Hi',
    });
    expect(c.data('tasks', 9)).toBeUndefined();
    expect(c.data('bless', 1)).toBeUndefined();
  });

  it('旧缓存里没有 data 时也不报错', () => {
    const c = useCatalogStore();
    c.apply(cat('x'));
    expect(c.data('tasks', 1)).toBeUndefined();
  });
});

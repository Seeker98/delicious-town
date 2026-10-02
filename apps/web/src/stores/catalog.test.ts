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
});

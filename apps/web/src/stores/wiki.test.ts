import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWikiStore } from './wiki';
import { useLocaleStore } from './locale';

describe('Wiki 数据缓存（问题记录 142）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('同一语言同一键只读一次（同时读也只发一个请求）；换语言重新读', async () => {
    const wiki = useWikiStore();
    const load = vi.fn(async (lang: string) => ({ lang }));
    const [a, b] = await Promise.all([wiki.get('streets', load), wiki.get('streets', load)]);
    expect(a).toEqual({ lang: 'zh-CN' });
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    useLocaleStore().locale = 'en';
    expect(await wiki.get('streets', load)).toEqual({ lang: 'en' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('读失败不缓存，下次重新读', async () => {
    const wiki = useWikiStore();
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ ok: 1 });
    await expect(wiki.get('goods', load)).rejects.toThrow('x');
    expect(await wiki.get('goods', load)).toEqual({ ok: 1 });
  });
});

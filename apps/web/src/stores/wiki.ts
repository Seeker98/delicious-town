import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { Locale } from '@dt/shared';
import { useLocaleStore } from './locale';

/**
 * 游戏资料（问题记录 142）：开放接口的数据按"语言 + 键"缓存在内存里。
 * 数据跟着配置走、不会变，同一页面来回切不再请求；同时读同一个键只发一个请求；读失败不缓存
 */
export const useWikiStore = defineStore('wiki', () => {
  const cache = new Map<string, Promise<unknown>>();
  function get<T>(key: string, load: (lang: Locale) => Promise<T>): Promise<T> {
    const lang = useLocaleStore().locale;
    const k = `${lang}:${key}`;
    let p = cache.get(k) as Promise<T> | undefined;
    if (!p) {
      p = load(lang).then((v) => (typeof v === 'object' && v !== null ? markRaw(v) : v));
      cache.set(k, p);
      p.catch(() => cache.delete(k));
    }
    return p;
  }
  return { get };
});

import { computed, toValue, watch, type MaybeRefOrGetter, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 一级标签页的当前标签（界面改版设计 §4.2 第 6 条）：写进网址 ?tab=（能分享、能后退、刷新不丢），
 * 不带参数进来时打开上次看的（本地存储），都没有用第一个。取代各页面各写各的五种做法。
 */
export interface TabQueryOptions<T extends string> {
  /** 可用的标签（顺序就是显示顺序）；可以是 computed（功能开关、数据决定哪些可用） */
  tabs: MaybeRefOrGetter<readonly T[]>;
  /** 记住上次看的标签的本地存储键；不给就不记 */
  storageKey?: string;
  /** 网址参数名，默认 'tab'（一番赏用 'line'） */
  param?: string;
  /** 等于这个值时网址里不写参数（一番赏的普通线） */
  omitWhen?: T;
}

export function useTabQuery<T extends string>(opts: TabQueryOptions<T>): WritableComputedRef<T> {
  const route = useRoute();
  const router = useRouter();
  const param = opts.param ?? 'tab';
  const list = computed(() => toValue(opts.tabs));
  const saved = (): string | null => {
    if (!opts.storageKey) return null;
    try {
      return localStorage.getItem(opts.storageKey);
    } catch {
      return null;
    }
  };
  const valid = (v: unknown): v is T => typeof v === 'string' && list.value.includes(v as T);
  const tab = computed<T>({
    get: () => {
      const q = route.query[param];
      if (valid(q)) return q;
      const s = saved();
      if (valid(s)) return s;
      return valid(opts.omitWhen) ? opts.omitWhen : (list.value[0] as T);
    },
    set: (v) => {
      const query = { ...route.query };
      if (opts.omitWhen !== undefined && v === opts.omitWhen) delete query[param];
      else query[param] = v;
      void router.replace({ query });
      if (opts.storageKey) {
        try {
          localStorage.setItem(opts.storageKey, v);
        } catch {
          // 存不了（隐私模式）也照样切换，只是下次打开不记得
        }
      }
    },
  });
  // 可用的标签变了（功能关了、数据读回来了），网址里的那个不再可用：改成现在显示的那个
  watch(list, () => {
    const q = route.query[param];
    if (typeof q === 'string' && !valid(q) && list.value.length > 0) {
      const shown = tab.value;
      tab.value = shown;
    }
  });
  return tab;
}

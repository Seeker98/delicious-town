import { computed, inject, ref, toValue, watch, type MaybeRefOrGetter, type WritableComputedRef } from 'vue';
import { isNavigationFailure, NavigationFailureType, routeLocationKey, routerKey } from 'vue-router';

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
  // 没有路由（单独挂组件的测试）时只在内存里切换，照样记住上次的
  const route = inject(routeLocationKey, null);
  const router = inject(routerKey, null);
  const memory = ref<string | null>(null);
  /** 刚切换、网址还没更新完时的值：页面紧接着按新标签读数据；网址变了（含浏览器后退）就以网址为准 */
  const pending = ref<string | null>(null);
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
  /** 当前网址参数换上这个标签（omitWhen 时去掉） */
  const withTab = (v: string) => {
    const query = { ...route!.query };
    if (opts.omitWhen !== undefined && v === opts.omitWhen) delete query[param];
    else query[param] = v;
    return query;
  };
  const tab = computed<T>({
    get: () => {
      if (valid(pending.value)) return pending.value;
      const q = route ? route.query[param] : memory.value;
      if (valid(q)) return q;
      const s = saved();
      if (valid(s)) return s;
      return valid(opts.omitWhen) ? opts.omitWhen : (list.value[0] as T);
    },
    set: (v) => {
      if (route && router) {
        pending.value = v;
        const path = route.path;
        void router.replace({ query: withTab(v) }).then((f) => {
          // 被别的跳转打断（切过去的面板挂载时按旧网址写参数，比如食谱列表写街道，终审 I1）：
          // 等打断它的那次走完，还在这页、还要这个标签而网址不是，就按当时的网址再写一次
          if (!isNavigationFailure(f, NavigationFailureType.cancelled)) return;
          const stop = router.afterEach(() => {
            stop();
            if (pending.value === v && route.path === path && route.query[param] !== withTab(v)[param])
              void router.replace({ query: withTab(v) });
          });
        });
      } else memory.value = v;
      if (opts.storageKey) {
        try {
          localStorage.setItem(opts.storageKey, v);
        } catch {
          // 存不了（隐私模式）也照样切换，只是下次打开不记得
        }
      }
    },
  });
  if (route)
    watch(
      () => route.query[param],
      () => (pending.value = null),
    );
  // 可用的标签变了（功能关了、数据读回来了），网址里的那个不再可用：改成现在显示的那个
  watch(list, () => {
    const q = route?.query[param];
    if (typeof q === 'string' && !valid(q) && list.value.length > 0) {
      const shown = tab.value;
      tab.value = shown;
    }
  });
  return tab;
}

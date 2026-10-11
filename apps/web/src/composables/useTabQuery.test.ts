import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useTabQuery, type TabQueryOptions } from './useTabQuery';

async function setup<T extends string>(path: string, opts: TabQueryOptions<T>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }],
  });
  await router.push(path);
  let tab!: ReturnType<typeof useTabQuery<T>>;
  const C = defineComponent({
    setup: () => {
      tab = useTabQuery(opts);
      return () => h('div');
    },
  });
  mount(C, { global: { plugins: [router] } });
  await flushPromises();
  return { tab, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useTabQuery（界面改版 P2b，设计 §4.2 第 6 条）', () => {
  const TABS = ['news', 'town', 'rank'] as const;

  it('网址里的标签优先；其次记住的；都没有用第一个', async () => {
    expect((await setup('/x?tab=rank', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('rank');
    localStorage.setItem('k', 'town');
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('town');
    localStorage.clear();
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
  });

  it('网址、本地存储里是不存在的值：用第一个，不报错；本地存储抛异常也一样', async () => {
    localStorage.setItem('k', 'xyz');
    expect((await setup('/x?tab=abc', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
  });

  it('切换：写进网址（保留别的参数）和本地存储', async () => {
    const { tab, router } = await setup('/x?street=2&page=3', { tabs: TABS, storageKey: 'k' });
    tab.value = 'rank';
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ street: '2', page: '3', tab: 'rank' });
    expect(localStorage.getItem('k')).toBe('rank');
  });

  it('可用的标签变了（功能关了），当前的不再可用：回第一个并改正网址', async () => {
    const on = ref(true);
    const tabs = computed(() => (on.value ? ['spot', 'futures'] : ['spot']));
    const { tab, router } = await setup('/x?tab=futures', { tabs });
    expect(tab.value).toBe('futures');
    on.value = false;
    await flushPromises();
    expect(tab.value).toBe('spot');
    expect(router.currentRoute.value.query.tab).toBe('spot');
  });

  it('自定参数名、默认值不写进网址（一番赏 ?line=）', async () => {
    const { tab, router } = await setup('/x?line=deluxe', {
      tabs: ['normal', 'deluxe'],
      param: 'line',
      omitWhen: 'normal',
    });
    expect(tab.value).toBe('deluxe');
    tab.value = 'normal';
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
  });
});

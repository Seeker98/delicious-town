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

  it('网址里是不存在的标签：改正网址，不写进“上次看的”（backlog P2b）', async () => {
    const { tab, router } = await setup('/x?tab=xyz&page=2', { tabs: TABS, storageKey: 'k' });
    expect(tab.value).toBe('news');
    expect(router.currentRoute.value.query).toEqual({ tab: 'news', page: '2' });
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('标签列表变了自动改回第一个：不写进“上次看的”；要的标签又出现时切回去（backlog P2b：期货冷启动）', async () => {
    const on = ref(true);
    const tabs = computed(() => (on.value ? ['spot', 'futures'] : ['spot']));
    const { tab, router } = await setup('/x?tab=futures', { tabs, storageKey: 'k' });
    on.value = false;
    await flushPromises();
    expect(tab.value).toBe('spot');
    expect(localStorage.getItem('k')).toBeNull();
    on.value = true;
    await flushPromises();
    expect(tab.value).toBe('futures');
    expect(router.currentRoute.value.query.tab).toBe('futures');
  });

  it('自动改掉以后玩家自己切过标签：要的标签再出现也不切回去', async () => {
    const on = ref(true);
    const tabs = computed(() => (on.value ? ['spot', 'bulk', 'futures'] : ['spot', 'bulk']));
    const { tab } = await setup('/x?tab=futures', { tabs });
    on.value = false;
    await flushPromises();
    tab.value = 'bulk';
    await flushPromises();
    on.value = true;
    await flushPromises();
    expect(tab.value).toBe('bulk');
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

  it('没有路由（单独挂组件的测试）：照样能切换，记住上次的，不报错', async () => {
    localStorage.setItem('k', 'rank');
    let tab!: ReturnType<typeof useTabQuery<'news' | 'rank'>>;
    const C = defineComponent({
      setup: () => {
        tab = useTabQuery({ tabs: ['news', 'rank'] as const, storageKey: 'k' });
        return () => h('div');
      },
    });
    mount(C);
    expect(tab.value).toBe('rank');
    tab.value = 'news';
    expect(tab.value).toBe('news');
    expect(localStorage.getItem('k')).toBe('news');
  });

  it('有路由时切换后立刻读到新值（网址异步更新前，页面里紧接着按新标签读数据）；之后浏览器后退照样跟着网址走', async () => {
    const { tab, router } = await setup('/x?tab=news', { tabs: TABS });
    tab.value = 'rank';
    expect(tab.value).toBe('rank');
    await flushPromises();
    await router.push('/x?tab=town');
    await flushPromises();
    expect(tab.value).toBe('town');
  });

  it('切过去的面板挂载时也改网址（食谱列表写街道）：切标签的那次被它打断，网址最后照样是新标签、别的参数也在（终审 I1）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }],
    });
    await router.push('/cookbooks?tab=mc');
    /** 像食谱列表：挂载时按旧的 route.query 写街道 */
    const Child = defineComponent({
      setup: () => {
        const route = router.currentRoute;
        void router.replace({ query: { ...route.value.query, street: '5' } });
        return () => h('div', 'list');
      },
    });
    let tab!: ReturnType<typeof useTabQuery<'list' | 'mc'>>;
    const Parent = defineComponent({
      setup: () => {
        tab = useTabQuery({ tabs: ['list', 'mc'] as const });
        return () => (tab.value === 'list' ? h(Child) : h('div', 'mc'));
      },
    });
    const w = mount(Parent, { global: { plugins: [router] } });
    await flushPromises();
    tab.value = 'list';
    await flushPromises();
    await flushPromises();
    expect(w.text()).toBe('list');
    expect(router.currentRoute.value.query).toEqual({ tab: 'list', street: '5' });
  });
});

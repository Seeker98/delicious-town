import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useRestaurantStore } from '../stores/restaurant';
import CookbooksView from './CookbooksView.vue';

/** 三个面板各有自己的测试，这里只看标签：换成只写名字的假组件 */
const fake = (id: string) => defineComponent({ render: () => h('div', { 'data-testid': id }) });
const stubs = {
  CookbookListPanel: fake('panel-list'),
  McPanel: fake('panel-mc'),
  ProgressPanel: fake('progress-summary'),
};

async function mountView(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cookbooks', component: CookbooksView }],
  });
  await router.push(path);
  const w = mount(CookbooksView, { global: { plugins: [router], stubs } });
  await flushPromises();
  return { w, router };
}

describe('食谱页三个标签：食谱、特色菜、进度一览（界面改版 P2b）', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useRestaurantStore().rest = { id: 1, streetId: 0, disabledFeatures: [] } as never;
  });

  it('三个标签，默认食谱', async () => {
    const { w } = await mountView('/cookbooks');
    expect(w.findAll('[role="tab"]').map((x) => x.text())).toEqual(['食谱', '特色菜', '进度一览']);
    expect(w.find('[data-testid="panel-list"]').exists()).toBe(true);
  });

  it('?tab=progress 打开进度一览', async () => {
    const { w } = await mountView('/cookbooks?tab=progress');
    expect(w.find('[data-testid="progress-summary"]').exists()).toBe(true);
    expect(w.find('[data-testid="panel-list"]').exists()).toBe(false);
  });

  it('特色菜关了只有两个标签', async () => {
    useRestaurantStore().rest = { id: 1, streetId: 0, disabledFeatures: ['mysterious'] } as never;
    const { w } = await mountView('/cookbooks?tab=mc');
    expect(w.findAll('[role="tab"]').map((x) => x.attributes('data-testid'))).toEqual([
      'tab-list',
      'tab-progress',
    ]);
    expect(w.find('[data-testid="panel-mc"]').exists()).toBe(false);
  });

  it('切到特色菜再切回食谱，网址里的街道还在', async () => {
    const { w, router } = await mountView('/cookbooks?street=2');
    await w.get('[data-testid="tab-mc"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="panel-mc"]').exists()).toBe(true);
    await w.get('[data-testid="tab-list"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.street).toBe('2');
    expect(w.find('[data-testid="panel-list"]').exists()).toBe(true);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import CreateRestaurantView from './CreateRestaurantView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { createRestaurant: vi.fn(), listShards: vi.fn() } }));

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/create', name: 'create-restaurant', component: CreateRestaurantView },
    ],
  });
  return { pinia, router };
}
const mountView = async () => {
  const { router } = setup();
  await router.push('/create');
  const w = mount(CreateRestaurantView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
};

describe('CreateRestaurantView', () => {
  beforeEach(() => {
    vi.mocked(endpoints.createRestaurant).mockReset();
    vi.mocked(endpoints.listShards).mockReset().mockResolvedValue([]);
  });

  it('名称不合规时直接在名字下面写红字，不请求服务端', async () => {
    const { w } = await mountView();
    const input = w.get('[data-testid="rest-name"]');
    await input.setValue('镇长的店');
    // 界面改版 P11：错误写在这一格下面，框变红
    expect(w.get('.dt-field-hint.is-bad').text()).toContain('官方');
    expect(input.attributes('aria-invalid')).toBe('true');
    await w.find('form').trigger('submit');
    expect(endpoints.createRestaurant).not.toHaveBeenCalled();
  });

  it('名字下面实时数字数：汉字算 1 个，字母数字算 5/8 个向上取整', async () => {
    const { w } = await mountView();
    expect(w.get('[data-testid="field-count"]').text()).toBe('0 / 8');
    await w.get('[data-testid="rest-name"]').setValue('好吃小馆');
    expect(w.get('[data-testid="field-count"]').text()).toBe('4 / 8');
    // 4 个汉字 32 分 + 3 个字母 15 分 = 47 分，约 5.9 个字，算 6 个
    await w.get('[data-testid="rest-name"]').setValue('好吃小馆abc');
    expect(w.get('[data-testid="field-count"]').text()).toBe('6 / 8');
    expect(w.find('.dt-field-hint.is-bad').exists()).toBe(false);
  });

  it('右上写现在所在的区服名', async () => {
    vi.mocked(endpoints.listShards).mockResolvedValue([
      {
        id: 2,
        name: '二服',
        status: 'open',
        openedAt: '2026-01-01T00:00:00Z',
        hasRestaurant: false,
        rest: null,
      },
    ]);
    const { router } = setup();
    useSessionStore().me = { accountId: 1, shardId: 2 } as never;
    await router.push('/create');
    const w = mount(CreateRestaurantView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.get('[data-testid="create-shard"]').text()).toBe('二服');
  });

  it('提交时去掉首尾空格，成功后进入餐厅首页', async () => {
    vi.mocked(endpoints.createRestaurant).mockResolvedValue({ id: 5 } as never);
    const { w, router } = await mountView();
    await w.get('[data-testid="rest-name"]').setValue('  好吃小馆 ');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(endpoints.createRestaurant).toHaveBeenCalledWith('好吃小馆');
    expect(router.currentRoute.value.name).toBe('home');
  });
});

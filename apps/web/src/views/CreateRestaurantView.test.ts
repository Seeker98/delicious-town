import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import CreateRestaurantView from './CreateRestaurantView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { createRestaurant: vi.fn() } }));

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

describe('CreateRestaurantView', () => {
  beforeEach(() => vi.mocked(endpoints.createRestaurant).mockReset());

  it('名称不合规时直接提示，不请求服务端', async () => {
    const { pinia, router } = setup();
    await router.push('/create');
    const w = mount(CreateRestaurantView, { global: { plugins: [pinia, router] } });
    await w.find('input').setValue('镇长的店');
    expect(w.find('[data-testid="name-error"]').text()).toContain('官方');
    await w.find('form').trigger('submit');
    expect(endpoints.createRestaurant).not.toHaveBeenCalled();
  });

  it('提交时去掉首尾空格，成功后进入餐厅首页', async () => {
    const { pinia, router } = setup();
    await router.push('/create');
    vi.mocked(endpoints.createRestaurant).mockResolvedValue({ id: 5 } as never);
    const w = mount(CreateRestaurantView, { global: { plugins: [pinia, router] } });
    await w.find('input').setValue('  好吃小馆 ');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(endpoints.createRestaurant).toHaveBeenCalledWith('好吃小馆');
    expect(router.currentRoute.value.name).toBe('home');
  });
});

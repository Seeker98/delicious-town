import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import YardView from './YardView.vue';

const stubs = {
  LandPanel: { template: '<p>land-panel</p>' },
  BasketPanel: { template: '<p>basket-panel</p>' },
  FormulaPanel: { template: '<p>formula-panel</p>' },
  SeedPanel: { template: '<p>seed-panel</p>' },
  FriendYard: { template: '<p>friend-yard {{ restId }}</p>', props: ['restId'] },
};

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/yard', component: YardView }],
  });
  await router.push(path);
  const w = mount(YardView, { global: { plugins: [router], stubs } });
  await flushPromises();
  return w;
}

describe('YardView（标签页）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('默认是菜园；切到菜篮；记住上次的标签', async () => {
    const w = await mountAt('/yard');
    expect(w.text()).toContain('land-panel');
    await w.find('[data-testid="tab-basket"]').trigger('click');
    expect(w.text()).toContain('basket-panel');
    const w2 = await mountAt('/yard');
    expect(w2.text()).toContain('basket-panel');
  });

  it('?friend=2 时只显示好友菜园', async () => {
    const w = await mountAt('/yard?friend=2');
    expect(w.text()).toContain('friend-yard 2');
    expect(w.find('[data-testid="tab-land"]').exists()).toBe(false);
  });
});

import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRestaurantStore } from '../stores/restaurant';
import MoreLinks from './MoreLinks.vue';

const targets = () =>
  mount(MoreLinks, { global: { stubs: { RouterLink: RouterLinkStub } } })
    .findAllComponents(RouterLinkStub)
    .map((l) => l.props('to'));

describe('"更多"入口（问题记录 248）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('还没读到餐厅时全部显示', () => {
    expect(targets()).toEqual(expect.arrayContaining(['/yard', '/exchange', '/predict', '/bar']));
  });

  it('区服关掉的功能不显示入口；没关的照常', () => {
    useRestaurantStore().rest = { disabledFeatures: ['yard', 'exchange', 'predict'] } as never;
    const to = targets();
    expect(to).not.toContain('/yard');
    expect(to).not.toContain('/exchange');
    expect(to).toContain('/bar');
    expect(to).toContain('/account');
  });

  it('事件预测关掉后入口保留：玩家还要看持仓和结算结果（backlog 238-1）', () => {
    useRestaurantStore().rest = { disabledFeatures: ['predict'] } as never;
    expect(targets()).toContain('/predict');
  });
});

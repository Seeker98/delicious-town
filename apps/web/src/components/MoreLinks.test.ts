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

  it('"其他"里有游戏资料入口，不受区服功能开关影响（问题记录 142）', () => {
    useRestaurantStore().rest = { disabledFeatures: ['yard', 'exchange'] } as never;
    expect(targets()).toContain('/wiki');
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

describe('"更多"入口精简（问题记录 447）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('去掉邀请好友、天气、收购、楼层餐桌、收益记录：首页和我的账号里已有', () => {
    const to = targets();
    for (const x of ['/invite', '/weather', '/acquire', '/rest/floor', '/rest/income'])
      expect(to).not.toContain(x);
  });

  it('餐厅信息放在"其他"；厨具入口只写"厨具"', () => {
    const w = mount(MoreLinks, { global: { stubs: { RouterLink: RouterLinkStub } } });
    const groups = w.findAll('.mb-2');
    // 组的文字：RouterLinkStub 渲染的 a 没有 href，按入口名字看
    const text = (title: string) => groups.find((g) => g.text().startsWith(title))!.text();
    expect(text('其他')).toContain('餐厅信息');
    expect(text('经营')).not.toContain('餐厅信息');
    const equip = w.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/rest/equip')!;
    expect(equip.text()).toBe('厨具');
  });
});

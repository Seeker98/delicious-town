import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RestaurantDto } from '@dt/shared';
import HomeStatus from './HomeStatus.vue';

/** 只填状态卡用到的字段 */
const rest = (p: Partial<RestaurantDto>) =>
  ({ state: 1, oil: 400, oilMax: 1000, coin: 100000, ...p }) as RestaurantDto;
const mountStatus = (p: Partial<RestaurantDto>, busy = false) =>
  mount(HomeStatus, {
    props: { rest: rest(p), busy },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

describe('首页营业状态卡（界面改版 P5，样稿 B）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('停业：标题写油用光了，整宽主按钮写加满和花费', () => {
    const w = mountStatus({ state: 2, oil: 0 });
    expect(w.classes()).toContain('is-closed');
    expect(w.get('.dt-home-oil-title').text()).toBe('油用光了, 餐厅停业');
    expect(w.text()).toContain('加满就能继续营业');
    const b = w.get('[data-testid="refuel"]');
    expect(b.classes()).toEqual(expect.arrayContaining(['btn-primary', 'dt-btn-block']));
    expect(b.get('.text-truncate').text()).toBe('加满');
    expect(b.get('.flex-shrink-0').text()).toBe('1,000');
    expect(b.attributes('aria-label')).toBe('加满 (1,000 银币)');
  });

  it('银币不够加满：写加油和实际花费', () => {
    const b = mountStatus({ state: 2, oil: 0, coin: 300 }).get('[data-testid="refuel"]');
    expect(b.get('.text-truncate').text()).toBe('加油');
    expect(b.get('.flex-shrink-0').text()).toBe('300');
    expect(b.attributes('disabled')).toBeUndefined();
  });

  it('营业中：写营业中，有油量进度条，加油是次要按钮', () => {
    const w = mountStatus({ state: 1, oil: 640 });
    expect(w.classes()).not.toContain('is-closed');
    expect(w.get('.dt-home-oil-title').text()).toBe('营业中');
    expect(w.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('64');
    const b = w.get('[data-testid="refuel"]');
    expect(b.classes()).toContain('btn-outline-primary');
    expect(b.classes()).not.toContain('dt-btn-block');
    expect(b.get('.flex-shrink-0').text()).toBe('360');
  });

  it('油是满的：按钮灰掉，写油是满的，不写花费', () => {
    const b = mountStatus({ state: 1, oil: 1000 }).get('[data-testid="refuel"]');
    expect(b.attributes('disabled')).toBeDefined();
    expect(b.text()).toBe('油是满的');
    expect(b.find('.flex-shrink-0').exists()).toBe(false);
  });

  it('油量数字、油壶扩容入口；点加油发 refuel 事件，忙的时候按钮灰掉', async () => {
    const w = mountStatus({ state: 1, oil: 400 });
    expect(w.get('[data-testid="rest-oil"]').text()).toBe('400');
    const up = w.getComponent(RouterLinkStub);
    expect(up.props('to')).toBe('/society/oil');
    expect(up.attributes('data-testid')).toBe('oil-upgrade');
    expect(up.attributes('aria-label')).toBe('油壶扩容');
    await w.get('[data-testid="refuel"]').trigger('click');
    expect(w.emitted('refuel')).toHaveLength(1);
    expect(
      mountStatus({ state: 1 }, true).get('[data-testid="refuel"]').attributes('disabled'),
    ).toBeDefined();
  });
});

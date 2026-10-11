import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DtEmpty from './DtEmpty.vue';
import DtSkeleton from './DtSkeleton.vue';

describe('空状态（界面改版 P3，设计 §5 第 8 条）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('配图、为什么空、去哪里获得的链接', () => {
    const w = mount(DtEmpty, {
      props: {
        art: 'empty-equip',
        title: '还没有厨具',
        body: '神殿鉴定、厨塔能得到',
        to: '/temple',
        link: '去神殿',
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(w.classes()).toContain('dt-empty-state');
    expect(w.get('svg.dt-art').attributes('aria-hidden')).toBe('true');
    expect(w.get('use').attributes('href')).toContain('#empty-equip');
    expect(w.get('.dt-empty-title').text()).toBe('还没有厨具');
    expect(w.text()).toContain('神殿鉴定、厨塔能得到');
    const link = w.getComponent(RouterLinkStub);
    expect(link.props('to')).toBe('/temple');
    expect(link.text()).toBe('去神殿');
  });

  it('不配图、不给链接时只有字', () => {
    const w = mount(DtEmpty, { props: { title: '还没有日志' } });
    expect(w.find('svg').exists()).toBe(false);
    expect(w.find('a').exists()).toBe(false);
    expect(w.text()).toBe('还没有日志');
  });
});

describe('加载骨架（界面改版 P3，设计 §5 第 8 条）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('N 行灰条，读屏读“加载中”', () => {
    const w = mount(DtSkeleton, { props: { rows: 3 } });
    expect(w.attributes('aria-busy')).toBe('true');
    expect(w.findAll('.dt-skel-row')).toHaveLength(3);
    expect(w.get('.visually-hidden').text()).toBe('加载中……');
  });
});

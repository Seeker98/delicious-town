import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NavRow from './NavRow.vue';

describe('导航行（界面改版 P2a，设计 §5.2）', () => {
  it('整行是一个链接：图标、名称、可选的当前值', () => {
    const w = mount(NavRow, {
      props: { to: '/account', art: 'me-settings', label: '账号和设置', value: '深色 · 简中' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(w.getComponent(RouterLinkStub).props('to')).toBe('/account');
    expect(w.classes()).toContain('dt-nav-row');
    expect(w.text()).toContain('账号和设置');
    expect(w.get('.dt-nav-row-value').text()).toBe('深色 · 简中');
  });
});

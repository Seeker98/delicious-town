import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import HelpView from './HelpView.vue';

beforeEach(() => setActivePinia(createPinia()));

describe('帮助中心（界面改版 P2a，设计 §4.1）', () => {
  it('六个入口', () => {
    const w = mount(HelpView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual([
      '/guide',
      '/wiki',
      '/wiki/guide',
      '/wiki/api',
      '/changelog',
      '/links',
    ]);
    expect(w.text()).toContain('更新记录');
  });
});

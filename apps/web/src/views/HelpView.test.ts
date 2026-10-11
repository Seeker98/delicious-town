import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { CHANGELOG } from '../data/changelog';
import HelpView from './HelpView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { openIndex: vi.fn() } }));

const mountView = async () => {
  const w = mount(HelpView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return w;
};
const linkTo = (w: Awaited<ReturnType<typeof mountView>>, id: string) =>
  w
    .findAllComponents(RouterLinkStub)
    .find((l) => l.attributes('data-testid') === id)
    ?.props('to');

describe('帮助中心（界面改版 P2a，设计 §4.1；P11 重排）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.openIndex).mockReset().mockRejectedValue(new Error('net'));
  });

  it('六个入口：游玩指引大卡、四个图块、友情链接一行', async () => {
    const w = await mountView();
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual([
      '/guide',
      '/wiki',
      '/wiki/guide',
      '/changelog',
      '/wiki/api',
      '/links',
    ]);
    expect(linkTo(w, 'help-guide')).toBe('/guide');
    expect(linkTo(w, 'help-wiki')).toBe('/wiki');
    expect(linkTo(w, 'help-wiki-guide')).toBe('/wiki/guide');
    expect(linkTo(w, 'help-changelog')).toBe('/changelog');
    expect(linkTo(w, 'help-api')).toBe('/wiki/api');
    expect(linkTo(w, 'help-links')).toBe('/links');
    expect(w.text()).toContain('更新记录');
  });

  it('资料库图块写一共多少条；读不到时只写有哪几类', async () => {
    const bare = await mountView();
    expect(bare.get('[data-testid="help-wiki"]').text()).not.toMatch(/\d+ 条/);
    vi.mocked(endpoints.openIndex).mockResolvedValue({
      counts: { goods: 1000, foods: 300, cookbooks: 200, equips: 30, streets: 4 },
    } as never);
    setActivePinia(createPinia());
    const w = await mountView();
    expect(w.get('[data-testid="help-wiki"]').text()).toContain('1,534 条');
  });

  it('更新记录图块：从没看过时带“新”；看过最新一天就不带', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="help-changelog-new"]').exists()).toBe(true);
    localStorage.setItem('dt_changelog_seen', CHANGELOG[0]!.date);
    const seen = await mountView();
    expect(seen.find('[data-testid="help-changelog-new"]').exists()).toBe(false);
  });
});

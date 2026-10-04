import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import LinksView from './LinksView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { links: vi.fn() } }));

describe('LinksView（问题记录 348）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列出链接，新窗口打开、不带来源；有说明时写在下面', async () => {
    vi.mocked(endpoints.links).mockResolvedValue([
      { id: 1, name: '贴吧', url: 'https://example.com', note: '玩家交流' },
      { id: 2, name: 'Wiki', url: 'http://example.org', note: '' },
    ]);
    const w = mount(LinksView);
    await flushPromises();
    const a = w.get('[data-testid="link-1"]');
    expect(a.attributes()).toMatchObject({ href: 'https://example.com', target: '_blank' });
    expect(a.attributes('rel')).toContain('noopener');
    expect(a.attributes('rel')).toContain('noreferrer');
    expect(w.text()).toContain('玩家交流');
    expect(w.find('[data-testid="links-empty"]').exists()).toBe(false);
  });

  it('没有链接时写“暂无”', async () => {
    vi.mocked(endpoints.links).mockResolvedValue([]);
    const w = mount(LinksView);
    await flushPromises();
    expect(w.find('[data-testid="links-empty"]').exists()).toBe(true);
  });
});

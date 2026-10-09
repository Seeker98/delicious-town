import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useCatalogStore } from '../../stores/catalog';
import RestIcons from './RestIcons.vue';
import { resetTitleList } from './titleList';

vi.mock('../../api/admin', () => ({
  adminApi: { icons: vi.fn(), grantIcon: vi.fn(), revokeIcon: vi.fn(), titles: vi.fn() },
}));

describe('RestIcons', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 't',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      looks: { doors: [], avatars: [], icons: [{ key: 'founder', title: '开服元老', desc: 'x' }] },
    });
    vi.mocked(adminApi.icons).mockResolvedValue([]);
    resetTitleList();
    vi.mocked(adminApi.titles).mockResolvedValue([
      {
        key: 'founder',
        id: null,
        title: '开服元老',
        desc: 'x',
        note: null,
        source: 'general',
        retired: false,
        owners: 0,
        createdBy: null,
        createdAt: null,
      },
    ]);
    vi.mocked(adminApi.grantIcon).mockResolvedValue([
      {
        id: 1,
        key: 'founder',
        title: '开服元老',
        shown: false,
        grantedAt: '2026-09-30T00:00:00Z',
        expiresAt: null,
      },
      {
        id: 2,
        key: 'fund_c',
        title: '流动赋能',
        shown: true,
        grantedAt: '2026-09-30T00:00:00Z',
        expiresAt: '2026-10-07T00:00:00Z',
      },
    ]);
  });

  it('选一个图标发放', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RestIcons, { props: { restId: 3 } });
    await flushPromises();
    await w.find('[data-testid="icon-select"]').setValue('founder');
    await w.find('[data-testid="icon-grant"]').trigger('click');
    await flushPromises();
    expect(adminApi.grantIcon).toHaveBeenCalledWith(3, { key: 'founder' });
    expect(w.text()).toContain('开服元老');
    expect(w.get('[data-testid="icon-expires-2"]').text()).toContain('限时');
    expect(w.find('[data-testid="icon-expires-1"]').exists()).toBe(false);
  });

  it('限时发放：选领取后 N 天，天数没填时不能发（定制称号设计 三）', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RestIcons, { props: { restId: 3 } });
    await flushPromises();
    await w.find('[data-testid="icon-select"]').setValue('founder');
    await w.find('[data-testid="icon-mode"]').setValue('days');
    expect(w.find('[data-testid="icon-grant"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="icon-days"]').setValue(7);
    await w.find('[data-testid="icon-grant"]').trigger('click');
    await flushPromises();
    expect(adminApi.grantIcon).toHaveBeenCalledWith(3, { key: 'founder', days: 7 });
  });
});

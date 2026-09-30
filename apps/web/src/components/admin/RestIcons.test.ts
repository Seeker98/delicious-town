import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useCatalogStore } from '../../stores/catalog';
import RestIcons from './RestIcons.vue';

vi.mock('../../api/admin', () => ({ adminApi: { icons: vi.fn(), grantIcon: vi.fn(), revokeIcon: vi.fn() } }));

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
    vi.mocked(adminApi.grantIcon).mockResolvedValue([
      { id: 1, key: 'founder', title: '开服元老', shown: false, grantedAt: '2026-09-30T00:00:00Z' },
    ]);
  });

  it('选一个图标发放', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RestIcons, { props: { restId: 3 } });
    await flushPromises();
    await w.find('[data-testid="icon-select"]').setValue('founder');
    await w.find('[data-testid="icon-grant"]').trigger('click');
    await flushPromises();
    expect(adminApi.grantIcon).toHaveBeenCalledWith(3, 'founder');
    expect(w.text()).toContain('开服元老');
  });
});

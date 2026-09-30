import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import RestLookView from './RestLookView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    myLooks: vi.fn(),
    setDoor: vi.fn(),
    setAvatar: vi.fn(),
    setNotice: vi.fn(),
    iconShow: vi.fn(),
  },
}));

describe('RestLookView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 't',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      looks: {
        doors: [
          { id: 0, name: '木门', coin: 0 },
          { id: 1, name: '红漆门', coin: 20000 },
        ],
        avatars: [
          { id: 1, name: '小厨师' },
          { id: 2, name: '大厨' },
        ],
        icons: [],
      },
    });
    vi.mocked(endpoints.myLooks).mockResolvedValue({
      door: 0,
      avatar: null,
      notice: '',
      icons: [{ id: 5, key: 'founder', title: '开服元老', desc: 'x', shown: false }],
    });
    for (const f of ['setDoor', 'setAvatar', 'setNotice', 'iconShow'] as const)
      vi.mocked(endpoints[f]).mockResolvedValue({} as never);
  });

  it('没设头像时提示；选头像、换门、保存公告、展示图标', async () => {
    const w = mount(RestLookView);
    await flushPromises();
    expect(w.text()).toContain('还没有设置头像');
    // 每次操作完成（busy 复位、重新读取）后再做下一个
    await w.find('[data-testid="avatar-2"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="door-1"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="notice"]').setValue('你好');
    await w.find('[data-testid="save-notice"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="icon-5"]').trigger('change');
    await flushPromises();
    expect(endpoints.setAvatar).toHaveBeenCalledWith(2);
    expect(endpoints.setDoor).toHaveBeenCalledWith(1);
    expect(endpoints.setNotice).toHaveBeenCalledWith('你好');
    expect(endpoints.iconShow).toHaveBeenCalledWith(5, true);
  });
});

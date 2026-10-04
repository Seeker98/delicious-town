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
    iconBuy: vi.fn(),
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
      icons: [{ id: 5, key: 'founder', title: '开服元老', desc: 'x', shown: false, expiresAt: null }],
    });
    for (const f of ['setDoor', 'setAvatar', 'setNotice', 'iconShow'] as const)
      vi.mocked(endpoints[f]).mockResolvedValue({} as never);
  });

  it('限时称号（240-2 发展基金）写剩余时间，永久的不写', async () => {
    vi.mocked(endpoints.myLooks).mockResolvedValue({
      door: 0,
      avatar: null,
      notice: '',
      icons: [
        { id: 5, key: 'founder', title: '开服元老', desc: 'x', shown: false, expiresAt: null },
        {
          id: 6,
          key: 'fund_c',
          title: '流动赋能',
          desc: 'y',
          shown: true,
          expiresAt: new Date(Date.now() + 2 * 3_600_000 + 60_000).toISOString(),
        },
      ],
    });
    const w = mount(RestLookView);
    await flushPromises();
    expect(w.get('[data-testid="icon-left-6"]').text()).toContain('剩余 2 小时');
    expect(w.find('[data-testid="icon-left-5"]').exists()).toBe(false);
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

  it('限定称号（240-2）：列出正在上架的，写价格和剩几天；确认后才买，已拥有的不能买；旧服务端没有这一块时不显示', async () => {
    const endsAt = new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString();
    vi.mocked(endpoints.myLooks).mockResolvedValue({
      door: 0,
      avatar: null,
      notice: '',
      icons: [],
      shop: [
        { key: 'oct26_s', title: '桂香小馆', desc: 'a', coin: 1_000_000, endsAt, owned: true },
        { key: 'oct26_l', title: '金秋食神', desc: 'b', coin: 8_000_000, endsAt, owned: false },
      ],
    });
    vi.mocked(endpoints.iconBuy).mockResolvedValue({ key: 'oct26_l' });
    const w = mount(RestLookView);
    await flushPromises();
    const shop = w.get('[data-testid="icon-shop"]');
    expect(shop.text()).toContain('金秋食神');
    expect(shop.text()).toContain('8,000,000');
    expect(shop.text()).toContain('3 天');
    expect(w.get('[data-testid="icon-buy-oct26_s"]').attributes('disabled')).toBeDefined();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await w.get('[data-testid="icon-buy-oct26_l"]').trigger('click');
    expect(endpoints.iconBuy).not.toHaveBeenCalled();
    await w.get('[data-testid="icon-buy-oct26_l"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[1]![0]).toContain('8,000,000');
    expect(endpoints.iconBuy).toHaveBeenCalledWith('oct26_l');
    confirm.mockRestore();

    vi.mocked(endpoints.myLooks).mockResolvedValue({ door: 0, avatar: null, notice: '', icons: [] });
    const old = mount(RestLookView);
    await flushPromises();
    expect(old.find('[data-testid="icon-shop"]').exists()).toBe(false);
  });
});

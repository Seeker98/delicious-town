import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ExchangePanel from './ExchangePanel.vue';
import { exchangeData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    townExchange: vi.fn(),
    townExchangeDo: vi.fn(),
    townLevelTicket: vi.fn(),
    townMysteryTicket: vi.fn(),
  },
}));

describe('ExchangePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.townExchange).mockResolvedValue(exchangeData());
  });

  it('按分类显示；材料不够、次数用完的灰掉并写明', async () => {
    const w = mount(ExchangePanel);
    await flushPromises();
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(3);
    expect(w.find('[data-testid="ex-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-row-2"]').text()).toContain('限兑 1 次，已兑 0 次');
    expect(w.find('[data-testid="ex-3"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-row-3"]').text()).toContain('已兑完');
    await w.find('[data-testid="cat-dt"]').trigger('click');
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(1);
  });

  it('兑换多份后重新读取', async () => {
    vi.mocked(endpoints.townExchangeDo).mockResolvedValue({ goodsId: 139, num: 2 });
    const w = mount(ExchangePanel);
    await flushPromises();
    await w.find('[data-testid="ex-num-1"]').setValue(2);
    await w.find('[data-testid="ex-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.townExchangeDo).toHaveBeenCalledWith(1, 2);
    expect(endpoints.townExchange).toHaveBeenCalledTimes(2);
  });

  it('和商店一样：一行一项，数量框和按钮在右侧操作区，点名称展开说明（问题记录 104）', async () => {
    const w = mount(ExchangePanel);
    await flushPromises();
    const row = w.find('[data-testid="ex-row-1"]');
    expect(row.classes()).toContain('dt-item');
    expect(row.find('.dt-item-actions [data-testid="ex-num-1"]').exists()).toBe(true);
    expect(row.find('.dt-item-actions [data-testid="ex-1"]').exists()).toBe(true);
  });
});

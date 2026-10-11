import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
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

/** 数量面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P10） */
const mountIt = (props: { part?: 'goods' | 'level' | 'mystery' } = {}) =>
  mount(ExchangePanel, { props, global: { stubs: { teleport: true } } });

describe('ExchangePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.townExchange).mockResolvedValue(exchangeData());
  });

  it('请求时带上是哪位 NPC 的页（backlog 1010：只有 13 哥的页查本街需求）', async () => {
    mountIt();
    await flushPromises();
    expect(endpoints.townExchange).toHaveBeenLastCalledWith('goods');
    mountIt({ part: 'level' });
    await flushPromises();
    expect(endpoints.townExchange).toHaveBeenLastCalledWith('level');
  });

  it('按分类显示；材料不够、次数用完的灰掉并写明', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(3);
    // 界面改版 P10：兑不了的行没有按钮，右边换成灰色小标签写明原因
    expect(w.find('[data-testid="ex-2"]').exists()).toBe(false);
    expect(w.get('[data-testid="ex-block-2"]').text()).toBe('材料不够');
    expect(w.find('[data-testid="ex-row-2"]').text()).toContain('限兑 1 次, 已兑 0 次');
    expect(w.find('[data-testid="ex-3"]').exists()).toBe(false);
    expect(w.get('[data-testid="ex-block-3"]').text()).toBe('已兑完');
    expect(w.find('[data-testid="ex-row-3"]').text()).toContain('已兑完');
    expect(w.get('[data-testid="cat-bg"]').attributes('aria-pressed')).toBe('true');
    await w.find('[data-testid="cat-dt"]').trigger('click');
    expect(w.get('[data-testid="cat-dt"]').attributes('aria-pressed')).toBe('true');
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(1);
  });

  it('排序（问题记录 499）：不限次数的在前，再是能兑的、材料不够的、已兑完的；同一组按价格从低到高', async () => {
    const base = exchangeData().items[1]!;
    const row = (id: number, num: number, have: number, times: number, used: number) => ({
      ...base,
      id,
      need: [{ goodsId: 180, num, have }],
      times,
      used,
    });
    vi.mocked(endpoints.townExchange).mockResolvedValue(
      exchangeData({
        items: [
          row(11, 8, 5, 1, 0), // 材料不够
          row(12, 3, 5, 1, 1), // 已兑完
          row(13, 5, 5, 1, 0), // 能兑，5 个
          row(14, 2, 0, -1, 0), // 不限次数（材料不够也在最前）
          row(15, 3, 5, 1, 0), // 能兑，3 个
          row(16, 1, 5, 1, 1), // 已兑完，更便宜
        ],
      }),
    );
    const w = mountIt();
    await flushPromises();
    expect(w.findAll('[data-testid^="ex-row-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'ex-row-14',
      'ex-row-15',
      'ex-row-13',
      'ex-row-11',
      'ex-row-16',
      'ex-row-12',
    ]);
  });

  it('填了份数以后顺序不变：材料只够 2 份的填 9 份也不挪到“材料不够”那组（495~513 遗留：缺的测试）', async () => {
    const base = exchangeData().items[1]!;
    const row = (id: number, num: number, have: number) => ({
      ...base,
      id,
      need: [{ goodsId: 180, num, have }],
      times: 9,
      used: 0,
    });
    vi.mocked(endpoints.townExchange).mockResolvedValue(
      exchangeData({ items: [row(21, 3, 5), row(22, 2, 5), row(23, 9, 1)] }),
    );
    const w = mountIt();
    await flushPromises();
    const order = () => w.findAll('[data-testid^="ex-row-"]').map((x) => x.attributes('data-testid'));
    const before = order();
    expect(before).toEqual(['ex-row-22', 'ex-row-21', 'ex-row-23']);
    // 界面改版 P10：份数在点“兑换”弹出的面板里选
    await w.get('[data-testid="ex-22"]').trigger('click');
    await w.get('[data-testid="ex-qty"]').setValue(9);
    expect(order()).toEqual(before);
  });

  it('兑换多份后重新读取', async () => {
    vi.mocked(endpoints.townExchangeDo).mockResolvedValue({ goodsId: 139, num: 2 });
    const w = mountIt();
    await flushPromises();
    await w.find('[data-testid="ex-1"]').trigger('click');
    await w.find('[data-testid="ex-qty"]').setValue(2);
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townExchangeDo).toHaveBeenCalledWith(1, 2);
    expect(endpoints.townExchange).toHaveBeenCalledTimes(2);
    // 兑换成功后面板关掉
    expect(w.find('[data-testid="qty-ok"]').exists()).toBe(false);
  });

  it('和商店一样：一行一项，按钮在右侧操作区（问题记录 104；界面改版 P10 份数挪进面板）', async () => {
    const w = mountIt();
    await flushPromises();
    const row = w.find('[data-testid="ex-row-1"]');
    expect(row.classes()).toContain('dt-row');
    expect(row.find('.dt-row-end [data-testid="ex-1"]').exists()).toBe(true);
  });

  it('不能兑的原因单独一行，不会被截断（终审 I1）', async () => {
    const w = mountIt();
    await flushPromises();
    const reason = w.find('[data-testid="ex-block-2"]');
    expect(reason.text()).toBe('材料不够');
    expect(reason.element.closest('.dt-clamp1')).toBeNull();
    expect(w.find('[data-testid="ex-block-1"]').exists()).toBe(false);
  });

  it('道具说明写在兑换面板里（终审 I6；界面改版 P10：原来点名称展开），能兑几份、消耗和得到写在合计里', async () => {
    useCatalogStore().goodsMap = new Map([
      [
        139,
        {
          id: 139,
          name: '神秘食材随机劵',
          type: 0,
          deviceType: null,
          level: 5,
          desc: '很长的说明',
          coin: 0,
          diamond: 0,
          stackable: true,
        },
      ],
    ]);
    const w = mountIt();
    await flushPromises();
    expect(w.text()).not.toContain('很长的说明');
    await w.get('[data-testid="ex-1"]').trigger('click');
    expect(w.text()).toContain('很长的说明');
    expect(w.text()).toContain('兑换 神秘食材随机劵');
    // 材料 5 个、一份 2 个：最多 2 份
    expect(w.get('[data-testid="qty-max"]').text()).toContain('2');
    await w.get('[data-testid="qty-max"]').trigger('click');
    expect(w.get('[data-testid="qty-ok"]').text()).toBe('兑换 2 份');
    expect(w.get('[data-testid="qty-sum"]').text()).toContain('消耗道具180×4');
    expect(w.get('[data-testid="qty-sum"]').text()).toContain('得到神秘食材随机劵×2');
    expect(w.get('[data-testid="qty-sum"]').text()).toContain('换完剩道具180×1');
  });

  it('兑换失败后也重新读取', async () => {
    vi.mocked(endpoints.townExchangeDo).mockRejectedValue(new Error('x'));
    const w = mountIt();
    await flushPromises();
    await w.find('[data-testid="ex-1"]').trigger('click');
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townExchange).toHaveBeenCalledTimes(2);
  });
});

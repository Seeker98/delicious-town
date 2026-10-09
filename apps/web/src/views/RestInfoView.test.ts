import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestInfoView from './RestInfoView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { overview: vi.fn(), restLog: vi.fn() } }));

const rest = (attrLeft: number) =>
  ({
    attrLeft,
    attrs: { cook: 1, cutting: 2, fire: 3, season: 4, creatives: 5 },
    luck: 6,
    tableNum: 4,
    cupboardNum: 100,
    foodsMaxNum: 999,
    foodsLockNum: 15,
    storeNum: 20,
    oilLevel: 1,
    thumbs: 56,
  }) as unknown as RestaurantDto;

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: RestInfoView }],
  });
  const w = mount(RestInfoView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('RestInfoView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.restLog).mockResolvedValue({ items: [], nextBefore: null });
  });

  it('餐厅和日志一起读，不等餐厅回来（性能排查 2026-10-08）', async () => {
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => undefined));
    await mountView();
    expect(endpoints.restLog).toHaveBeenCalled();
  });

  it('容量那组带累计获赞（问题记录 553）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(rest(0));
    const w = await mountView();
    expect(w.get('[data-testid="info-thumbs"]').text()).toBe('累计获赞 56');
  });

  it('只读显示属性；加点挪到厨具页，这里放链接（问题记录：加点在餐厅信息里很难找）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(rest(3));
    const w = await mountView();
    expect(w.text()).toContain('幸运 6');
    expect(w.find('input').exists()).toBe(false);
    const link = w.find('[data-testid="to-points"]');
    expect(link.text()).toBe('有 3 点可加'); // 箭头由 .dt-go 加（问题记录 451）
    expect(link.classes()).toContain('dt-go');
    // 有点可加时直接落到厨具页下面的加点框（530 遗留：加点框挪到下面以后要往下翻）
    expect(link.attributes('href')).toBe('/rest/equip#attr-points');
    vi.mocked(endpoints.overview).mockResolvedValue(rest(0));
    const none = (await mountView()).find('[data-testid="to-points"]');
    expect(none.text()).toBe('厨具与加点');
    expect(none.attributes('href')).toBe('/rest/equip');
  });

  it('日志：读完是空的才写还没有日志；读的时候不写；读失败写读取失败（问题记录 100 终审）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(rest(0));
    let done: (v: { items: never[]; nextBefore: null }) => void = () => undefined;
    vi.mocked(endpoints.restLog).mockReturnValue(new Promise((r) => (done = r)));
    const w = await mountView();
    expect(w.find('[data-testid="logs-empty"]').exists()).toBe(false);
    done({ items: [], nextBefore: null });
    await flushPromises();
    expect(w.get('[data-testid="logs-empty"]').text()).toBe('还没有日志');
    vi.mocked(endpoints.restLog).mockRejectedValue(new Error('net'));
    const failed = await mountView();
    expect(failed.find('[data-testid="logs-empty"]').exists()).toBe(false);
    expect(failed.get('[data-testid="logs-failed"]').text()).toBe('读取日志失败');
  });
});

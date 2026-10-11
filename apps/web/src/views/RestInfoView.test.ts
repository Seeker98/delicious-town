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
    // 界面改版 P3：键值行，名字在 dt、数值在 dd
    expect(w.get('[data-testid="info-thumbs"]').text()).toBe('56');
    expect(w.get('[data-testid="info-thumbs"]').element.previousElementSibling?.textContent).toBe('累计获赞');
  });

  it('旧服务端没有 thumbs：不显示累计获赞（终审：前端先上线）', async () => {
    const { thumbs: _t, ...old } = rest(0) as RestaurantDto & { thumbs: number };
    vi.mocked(endpoints.overview).mockResolvedValue(old as RestaurantDto);
    const w = await mountView();
    expect(w.find('[data-testid="info-thumbs"]').exists()).toBe(false);
    const luck = w.findAll('[data-testid="info-attrs"] dt').find((x) => x.text() === '幸运')!;
    expect(luck.element.nextElementSibling?.textContent).toBe('6');
  });

  it('只读显示属性；加点挪到厨具页，这里放链接（问题记录：加点在餐厅信息里很难找）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(rest(3));
    const w = await mountView();
    expect(w.get('[data-testid="info-attrs"]').text()).toContain('幸运6');
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

describe('餐厅信息套用键值行和只读行（界面改版 P3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('属性、容量是两列键值行（dl）；日志每条一行，时间写月日时分', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(rest(0));
    vi.mocked(endpoints.restLog).mockResolvedValue({
      items: [{ type: 'level.up', params: { level: 7 }, at: '2026-10-10T03:28:03.000Z' }],
      nextBefore: null,
    } as never);
    const w = await mountView();
    const attrs = w.get('[data-testid="info-attrs"]');
    expect(attrs.element.tagName).toBe('DL');
    expect(attrs.classes()).toContain('dt-kv-grid');
    expect(attrs.findAll('dt').map((x) => x.text())).toContain('厨艺');
    expect(w.get('[data-testid="info-capacity"]').element.tagName).toBe('DL');
    // 每对名字和数值包成一组，按宽度自动排两列或一列：法文名字长，360px 下原来溢出（P3 截图）
    const pairs = w.findAll('[data-testid="info-capacity"] > .dt-kv-pair');
    expect(pairs.length).toBeGreaterThan(5);
    expect(pairs[0]!.findAll('dt')).toHaveLength(1);
    expect(pairs[0]!.findAll('dd')).toHaveLength(1);
    const row = w.get('.dt-feed');
    expect(row.get('.dt-feed-time').text()).not.toContain('2026');
  });

  it('餐厅数据没回来时是骨架行；没有日志时是空状态', async () => {
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => undefined));
    vi.mocked(endpoints.restLog).mockResolvedValue({ items: [], nextBefore: null });
    expect((await mountView()).find('[data-testid="info-skeleton"]').exists()).toBe(true);
    vi.mocked(endpoints.overview).mockResolvedValue(rest(0));
    const w = await mountView();
    expect(w.get('[data-testid="logs-empty"]').classes()).toContain('dt-empty-state');
  });
});

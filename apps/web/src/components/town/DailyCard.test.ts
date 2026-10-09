import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyDto, NewsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useLocaleStore } from '../../stores/locale';
import { useRestaurantStore } from '../../stores/restaurant';
import DailyCard from './DailyCard.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { townDaily: vi.fn() } }));

const art = (title: string, body: string) => ({ title, body });
const dto = (o: Partial<DailyDto> = {}): DailyDto => ({
  day: '2026-10-08',
  days: ['2026-10-08', '2026-10-07'],
  article: {
    'zh-CN': art('小镇又热闹了', '{r:7} 升到了 4 星。\n\n{r:8} 搬家了'),
    en: art('Busy day', '{r:7} reached 4 stars.'),
    'zh-TW': art('小鎮又熱鬧了', '{r:7} 升到了 4 星。'),
  },
  fallback: [],
  rests: { 7: '小王的店', 8: null },
  ...o,
});
const news = (id: number): NewsDto => ({
  id,
  type: 'star.up',
  restId: 7,
  restName: '小王的店',
  params: { star: 3 },
  createdAt: '2026-10-08T04:00:00.000Z',
});
const mountCard = () => mount(DailyCard, { global: { stubs: { RouterLink: RouterLinkStub } } });

describe('DailyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('已发布：标题、分段正文；店名带链接，关了的店写“已关店”', async () => {
    vi.mocked(endpoints.townDaily).mockResolvedValue(dto());
    const w = mountCard();
    await flushPromises();
    expect(endpoints.townDaily).toHaveBeenCalledWith(undefined);
    expect(w.find('[data-testid="daily-title"]').text()).toBe('小镇又热闹了');
    const paras = w.findAll('[data-testid="daily-para"]');
    expect(paras).toHaveLength(2);
    expect(paras[1]!.text()).toBe('已关店 搬家了');
    const link = w.findComponent(RouterLinkStub);
    expect(link.props('to')).toBe('/friends/7');
    expect(link.text()).toBe('小王的店');
    expect(w.find('[data-testid="daily-english-only"]').exists()).toBe(false);
  });

  it('没发布：显示今日要闻', async () => {
    vi.mocked(endpoints.townDaily).mockResolvedValue(dto({ article: null, fallback: [news(1), news(2)] }));
    const w = mountCard();
    await flushPromises();
    expect(w.find('[data-testid="daily-title"]').text()).toBe('今日要闻');
    expect(w.findAll('[data-testid="daily-fallback"]')).toHaveLength(2);
    expect(w.text()).toContain('这一天的日报还在编辑中');
  });

  it('西语看英文版，写明只有英文', async () => {
    await useLocaleStore().set('es');
    vi.mocked(endpoints.townDaily).mockResolvedValue(dto());
    const w = mountCard();
    await flushPromises();
    expect(w.find('[data-testid="daily-title"]').text()).toBe('Busy day');
    expect(w.find('[data-testid="daily-english-only"]').exists()).toBe(true);
  });

  it('翻到前一天：带上日期重新读；最旧的一天不能再往前', async () => {
    vi.mocked(endpoints.townDaily)
      .mockResolvedValueOnce(dto())
      .mockResolvedValueOnce(dto({ day: '2026-10-07' }));
    const w = mountCard();
    await flushPromises();
    expect(w.find('[data-testid="daily-next"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="daily-prev"]').trigger('click');
    await flushPromises();
    expect(endpoints.townDaily).toHaveBeenLastCalledWith('2026-10-07');
    expect(w.find('[data-testid="daily-prev"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="daily-next"]').attributes('disabled')).toBeUndefined();
  });

  it('选中的那天没有稿子（刚开、或 00:10 前）：还能往前翻到更早的（backlog）', async () => {
    vi.mocked(endpoints.townDaily)
      .mockResolvedValueOnce(dto({ day: '2026-10-08', days: ['2026-10-07', '2026-10-06'], article: null }))
      .mockResolvedValueOnce(dto({ day: '2026-10-07', days: ['2026-10-07', '2026-10-06'] }));
    const w = mountCard();
    await flushPromises();
    expect(w.find('[data-testid="daily-prev"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="daily-next"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="daily-prev"]').trigger('click');
    await flushPromises();
    expect(endpoints.townDaily).toHaveBeenLastCalledWith('2026-10-07');
  });

  it('本地已经知道区服关了日报：不发请求（backlog）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['daily'] } as never;
    const w = mountCard();
    await flushPromises();
    expect(endpoints.townDaily).not.toHaveBeenCalled();
    expect(w.find('[data-testid="daily-card"]').exists()).toBe(false);
  });

  it('区服没开日报：整张卡片不显示', async () => {
    vi.mocked(endpoints.townDaily).mockRejectedValue(new ApiError('FEATURE_DISABLED', { feature: 'daily' }));
    const w = mountCard();
    await flushPromises();
    expect(w.find('[data-testid="daily-card"]').exists()).toBe(false);
  });
});

import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HeadlinesDto } from '@dt/shared';
import { useLocaleStore } from '../../stores/locale';
import HomeNews from './HomeNews.vue';

const head = (daily: HeadlinesDto['daily']): HeadlinesDto => ({ news: [], broadcast: null, daily });
const daily = {
  day: '2026-10-08',
  title: { 'zh-CN': '{r:7} 又上新闻了', en: '{r:7} makes the news', 'zh-TW': '{r:7} 又上新聞了' },
  rests: { 7: '小王的店' },
};
const mountIt = (h: HeadlinesDto) =>
  mount(HomeNews, { props: { headlines: h }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe('HomeNews 小镇日报入口', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('昨天的日报发布了：第一行是日报标题，店名换好，点了去小镇新闻', () => {
    const w = mountIt(head(daily));
    const row = w.find('[data-testid="home-daily"]');
    expect(row.text()).toBe('小镇日报: 小王的店 又上新闻了');
    expect(row.findComponent(RouterLinkStub).props('to')).toBe('/town?tab=news');
  });

  it('法语看英文标题', async () => {
    await useLocaleStore().set('fr');
    expect(mountIt(head(daily)).find('[data-testid="home-daily"]').text()).toContain(
      '小王的店 makes the news',
    );
  });

  it('没有日报就不显示这一行', () => {
    expect(mountIt(head(null)).find('[data-testid="home-daily"]').exists()).toBe(false);
  });

  it('首页最多列 2 条：按日报、广播、新闻的先后取（问题记录 619）', () => {
    const n = (id: number) => ({
      id,
      type: 'x',
      restId: null,
      restName: null,
      params: {},
      createdAt: '2026-10-13T01:00:00.000Z',
    });
    const w = mountIt({ news: [n(1), n(2)], broadcast: { ...n(9), type: 'broadcast' }, daily });
    expect(w.find('[data-testid="home-daily"]').exists()).toBe(true);
    expect(w.findAll('[data-testid="home-broadcast"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="home-news"]')).toHaveLength(0);
    const w2 = mountIt({ news: [n(1), n(2)], broadcast: null, daily: null });
    expect(w2.findAll('[data-testid="home-news"]')).toHaveLength(2);
  });
});

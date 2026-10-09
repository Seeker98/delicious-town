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
});

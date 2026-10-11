import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import GuideView from './GuideView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { guideCodes: vi.fn(), redeem: vi.fn(), catalog: vi.fn(() => new Promise(() => {})) },
}));

const me = (restaurantId: number | null) => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role: 'player' as const,
  shardId: 1,
  restaurantId,
  lang: null,
  npcRestId: null,
});
const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: GuideView }],
  });
  const w = mount(GuideView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('GuideView（问题记录 150）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.guideCodes).mockReset();
    vi.mocked(endpoints.redeem).mockReset();
  });

  it('页首有游戏资料入口（问题记录 142）', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const w = await mountView();
    expect(w.get('[data-testid="guide-wiki"]').attributes('href')).toBe('/wiki');
  });

  it('常见问题写明钻石、蟹黄堡怎么获得，带去酒吧、小镇的链接（问题记录 332）', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const faq = (await mountView()).get('[data-testid="guide-faq"]');
    expect(faq.text()).toContain('钻石怎么获得');
    expect(faq.text()).toContain('蟹黄堡怎么获得');
    const links = faq.findAll('a').map((x) => x.attributes('href'));
    expect(links).toEqual(expect.arrayContaining(['/bar', '/society/mayor', '/rest/tasks?tab=weekly']));
  });

  it('四块内容都在（新手码搬去了兑换码页）', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const w = await mountView();
    for (const k of ['start', 'daily', 'faq', 'rules'])
      expect(w.find(`[data-testid="guide-${k}"]`).exists()).toBe(true);
  });

  it('常见问题里写事件预测可以开奖前卖出止盈止损（问题记录 260）', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const w = await mountView();
    const faq = w.get('[data-testid="guide-faq"]').text();
    expect(faq).toContain('事件预测');
    expect(faq).toContain('止损');
  });

  it('新手兑换码搬到兑换码页：这里只留一条链接（界面改版 P2b）', async () => {
    useSessionStore().me = me(1);
    const w = await mountView();
    expect(w.find('[data-testid="guide-codes"]').exists()).toBe(false);
    expect(w.get('[data-testid="guide-to-redeem"]').attributes('href')).toBe('/redeem');
    expect(endpoints.guideCodes).not.toHaveBeenCalled();
  });
});

describe('GuideView 文案和代码一致（终审 I1）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('不说结算要橱柜食材；说清油用完会停业；不提不存在的版块和做不到的处罚', async () => {
    useSessionStore().me = me(null);
    const w = await mountView();
    const text = w.text();
    expect(text).not.toContain('食材不够就做不了');
    expect(text).not.toContain('食材越全');
    expect(text).toContain('油用完');
    expect(text).not.toContain('答疑');
    expect(text).not.toContain('"建议"版');
    expect(text).not.toContain('违规所得会被收回');
  });

  it('没进区服时提示"进入区服、开店后可以领"', async () => {
    useSessionStore().me = me(null);
    const w = await mountView();
    expect(w.text()).toContain('进入区服、开店后可以领');
  });
});

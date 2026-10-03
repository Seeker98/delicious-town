import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { activeMessages } from '.';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import GuideView from '../views/GuideView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { guideCodes: vi.fn(async () => []), catalog: vi.fn(() => new Promise(() => {})) },
}));

describe('第 6 批其他页面按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：厨具、任务、邀请的文案', async () => {
    await useLocaleStore().set('en');
    const m = activeMessages();
    expect(m.equip.detail.confirmRollback('Rollback Stone', 2, 1)).toBe(
      'Use 1 Rollback Stone to undo 2 enhancement level(s)? The extra 1 level(s) will be wasted.',
    );
    expect(m.rest.tasks.claim(40, true)).toBe('Claim 40-point reward ×2');
    expect(m.misc.invite.stage.pending(10)).toBe(
      'Level 10 reward pending (sent once you open a restaurant on that server)',
    );
    expect(m.nav.mailUnread(3)).toBe('Mailbox, 3 unread');
  });

  it('英语：游玩指引里的链接跟着语言', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    setActivePinia(pinia);
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
      lang: 'en',
    };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: GuideView }],
    });
    const w = mount(GuideView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    const start = w.get('[data-testid="guide-start"]');
    expect(start.text()).toContain('First day');
    expect(start.findAll('a').map((a) => a.text())).toEqual([
      'Market',
      'Cookware & points',
      'Recipes',
      'Guild',
      'Quests',
    ]);
    w.unmount();
  });
});

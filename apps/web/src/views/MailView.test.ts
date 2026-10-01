import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import MailView from './MailView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    mail: vi.fn(),
    mailUnread: vi.fn(),
    mailRead: vi.fn(),
    mailClaim: vi.fn(),
    mailClaimAll: vi.fn(),
    mailDelete: vi.fn(),
  },
}));

const mail = (patch: Partial<MailDto> = {}): MailDto => ({
  id: 1,
  title: '开服礼',
  body: '欢迎\n来到小镇',
  items: { coin: 100, hats: [{ tier: 'jade', name: '大橘' }] },
  source: 'admin',
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  read: false,
  claimed: false,
  minLevel: null,
  ...patch,
});

describe('MailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    useRestaurantStore().rest = { level: 5 } as never;
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail()], unread: 1, level: 5 });
    vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 0 });
    vi.mocked(endpoints.mailClaim).mockResolvedValue({ id: 1, items: { coin: 100 } });
    vi.mocked(endpoints.mailRead).mockResolvedValue(undefined as never);
  });

  it('列出邮件：附件摘要（含命名帽子）、剩余天数；领取后重新读取', async () => {
    const w = mount(MailView);
    await flushPromises();
    expect(w.text()).toContain('开服礼');
    expect(w.text()).toContain('银币 100');
    expect(w.text()).toContain('玉•大橘之帽');
    expect(w.text()).toContain('还剩 3 天');
    await w.find('[data-testid="mail-claim-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailClaim).toHaveBeenCalledWith(1);
    expect(endpoints.mail).toHaveBeenCalledTimes(2);
  });

  it('等级不够时领取按钮禁用并写明要几级；展开正文时标记已读，换行保留', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail({ minLevel: 10 })], unread: 1, level: 5 });
    const w = mount(MailView);
    await flushPromises();
    const btn = w.find('[data-testid="mail-claim-1"]');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('需 10 级');
    await w.find('[data-testid="mail-title-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailRead).toHaveBeenCalledWith(1);
    expect(w.find('[data-testid="mail-body-1"]').text()).toContain('欢迎\n来到小镇');
  });

  it('领完的邮件显示删除；一键领取汇报失败封数', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({
      items: [mail({ id: 2, claimed: true }), mail({ id: 3 })],
      unread: 0,
      level: 5,
    });
    vi.mocked(endpoints.mailClaimAll).mockResolvedValue({ claimed: 0, failed: 1, items: [] });
    const w = mount(MailView);
    await flushPromises();
    expect(w.find('[data-testid="mail-delete-2"]').exists()).toBe(true);
    await w.find('[data-testid="mail-claim-all"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('1 封没领成');
  });

  it('等级按邮箱接口返回的当前等级判断，不依赖餐厅 store 是否加载（终审 I1）', async () => {
    useRestaurantStore().rest = null;
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail({ minLevel: 10 })], unread: 1, level: 12 });
    const w = mount(MailView);
    await flushPromises();
    expect(w.find('[data-testid="mail-claim-1"]').attributes('disabled')).toBeUndefined();
    expect(w.text()).not.toContain('需 10 级');
  });
});
